import {useContext, useEffect, useRef} from "react";
import * as baseUtils from '../../helpers/baseUtils';
import {getMagicItemByProp} from "../../constants/magicList";
import tr from "../../helpers/langHelper";
import {AudioPlayerContext} from "../../index";
import useWithDispatch from "../base/useWithDispatch";
import {rouletteSlice} from "../../store/reducers/roulette";
import {useSelector} from "react-redux";


export default function useRoulette(cardsImages) {
    const audioPlayer = useContext(AudioPlayerContext);
    const {
        setAttemptList,
        setMagicCard,
        setRouletteStatus,
        setOpenedMagicKeys,
    } = useWithDispatch(rouletteSlice);
    const {
        attemptList,
        openedMagicKeys,
        rouletteStatus
    } = useSelector(state => state.roulette);

    const magicSectorsRef = useRef([]);
    const timerIdRotateEndRef = useRef(null);
    const timerIdAllOpenedRef = useRef(null);

    useEffect(() => {
        // подписка на событие клавиатуры - по нажатию Enter крутим ранее не запущенное колесо
        document.addEventListener('keydown', onPressEnterButton)
        return () => {
            document.removeEventListener('keydown', onPressEnterButton);
            timerIdRotateEndRef.current = null;
            timerIdAllOpenedRef.current = null;
        }
    });


    useEffect(() => {
        magicSectorsRef.current = getMagicSectorsList();
    }, []);


    // по нажатию Enter/пробела крутим ранее не запущенное колесо
    const onPressEnterButton = (event) =>
        ['Enter', 'Space'].includes(event.code) ? onRotateStart() : null;

    const addAttempts = () =>
        setAttemptList(attemptList.concat(...baseUtils.shuffle(['fail', 'win', 'rand'])));

    const getMagicSectorsList = () => (
        [
            {
                sectorNum: 5,
                key: 'gift_pack'
            },
            {
                sectorNum: 7,
                key: 'lamp_card'
            },
            {
                sectorNum: 11,
                key: 'repeat_card'
            },
        ].map(sectorItem => {
            const magicFullItem = getMagicItemByProp('key', sectorItem.key);
            return {
                ...sectorItem,
                title: magicFullItem.title,
                image: cardsImages.magic[magicFullItem.num + '-' + 1]
            }
        })
    )


    const getRouletteTargetDeg = () => {
        let sectorNum;
        let magicCard;
        const attemptResult = attemptList[0];
        // убираем уже доступные магические карты
        const rouletteMagicList = magicSectorsRef.current
            .filter(item => !openedMagicKeys.includes(item.key));
        const currentMagicItem = baseUtils.randFromArrayObject(rouletteMagicList);
        const failNum = baseUtils.randFromArrayObject([2, 4, 6, 8, 10, 12]);

        if (attemptResult === 'fail') {
            sectorNum = failNum;
            magicCard = null;
        } else if (attemptResult === 'win') {
            sectorNum = currentMagicItem.sectorNum;
            magicCard = currentMagicItem;
            setOpenedMagicKeys(openedMagicKeys.concat(currentMagicItem.key))
        } else if (attemptResult === 'rand') {
            sectorNum = baseUtils.randAB(1, 12);
            const freeMagicItem = magicSectorsRef.current.find(item => item.sectorNum === sectorNum);
            if (freeMagicItem) {
                magicCard = freeMagicItem;
                if (openedMagicKeys.includes(freeMagicItem.key)) {
                    magicCard.isRepeat = true;
                } else {
                    setOpenedMagicKeys(openedMagicKeys.concat(freeMagicItem.key))
                }
            } else {
                magicCard = null;
            }
        }
        setMagicCard(magicCard);
        return 360 / 12 * sectorNum;
    }

    // запускаем вращение колеса
    const onRotateStart = () => {
        if (rouletteStatus.isRotating || !attemptList.length) {
            return;
        }
        const rotateDeg = rouletteStatus.rotateDeg;
        // добираем до целого круга, избавляемся от излишков предыдущих вращений
        const oldDelta = !rotateDeg ? 0 :
            rotateDeg + (360 - (rotateDeg - Math.trunc(rotateDeg / 360) * 360));
        // картинка колеса на 15градусов смещена вправо
        const initialOffset = 360 / 12 / 2;
        // базовые круги, чтоб колесо долго и красиво крутилось
        const baseNeededDeg = 5 * 360;
        // угол до целевого сектора
        // из 360 вычитаем потому что шагает колесо против часовой как бы хотя внешне крутится по часовой
        const targetMagicDeg = (360 - getRouletteTargetDeg());
        // до необходимого сектора добираемся с помощью добавочного угла
        const randOffsetDeg = baseUtils.randAB(5, 25);
        setRouletteStatus({
            rotateDeg: oldDelta + initialOffset + baseNeededDeg + targetMagicDeg + randOffsetDeg,
            isRotating: true,
            resultComment: '',
            magicCard: null
        });
    }

    const onRotateEnd = async () => {
        // базовый звук остановки колеса
        audioPlayer.play('wheelStop');
        timerIdRotateEndRef.current = setTimeout(_ => {
            setRouletteStatus({
                rotateDeg: rouletteStatus.rotateDeg,
                isRotating: false,
                magicCard: rouletteStatus.magicCard ? {...rouletteStatus.magicCard} : null,
                resultComment: getResultComment()
            });
            attemptList.shift()
            setAttemptList(attemptList);
            audioPlayer.play('rouletteResult');
        }, 1500);
        return new Promise((resolve) => {
            timerIdAllOpenedRef.current = setTimeout(_ => {
                // все карты открыты, уведомляем, закрываем рулетку
                const allMagicCardsQty = 12;
                if (openedMagicKeys.length === allMagicCardsQty) {
                    resolve(true);
                }
                else {
                    resolve(false);
                }
            }, 5000);
        });
    }

    const getResultComment = () => {
        let message;
        const magicCard = rouletteStatus.magicCard;
        if (!magicCard) {
            message = tr('Пока ничего не выпало. Попробуй еще');
        } else if (magicCard && magicCard.isRepeat) {
            message = tr('Эта карта уже была открыта. Попробуй еще')
        } else if (magicCard) {
            message = tr('Открыта новая магическая карта') + ` «${magicCard.title}»`;
        }
        return message;
    }


    return {
        rouletteStatus,
        attemptList,
        addAttempts,
        onRotateStart,
        onRotateEnd,
    };
}