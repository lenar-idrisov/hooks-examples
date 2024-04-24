import * as baseUtils from "../../helpers/baseUtils";
import { useContext, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import DroppedHelper from "../../helpers/DroppedHelper";
import CardsHelper from "../../helpers/CardsHelper";
import useWithDispatch from "../base/useWithDispatch";
import { droppedCardsSlice } from "../../store/reducers/droppedCards";
import { playersSlice } from "../../store/reducers/players";
import {
    getMagicItemByProp,
    getMagicKeyByNum,
    getMagicNumsByKeys
} from "../../constants/magicList";
import { AudioPlayerContext } from "../../index";
import { commandsSlice } from "../../store/reducers/commands";
import { nanoid } from "nanoid";
import useTimeout from "../base/useTimeout";
import FinderXYHelper from "../../helpers/FinderXYHelper";


export default function useRobot({
    applyMagicCardEffect,
    boardSizes,
    cardSizes,
}) {
    const audioPlayer = useContext(AudioPlayerContext);
    const magicCardForApply = useRef(null);
    const dataForContinueRobotAttack = useRef(null);
    const dataForContinueRobotDefend = useRef(null);
    // местоположение последней положенной на доску карты
    const settingsState = useSelector(state => state.settings);
    const { loserId } = useSelector(state => state.party);
    const { trump } = useSelector(state => state.app);
    const { playerCommand } = useSelector(state => state.commands);
    const droppedCardsState = useSelector(state => state.droppedCards);
    const [userState, robotState] = useSelector(state => state.players);

    const { addDroppedPairedCards, addDroppedSingleCards } = useWithDispatch(droppedCardsSlice);
    const { removePlayerCardsByIds } = useWithDispatch(playersSlice);
    const {
        setNextMoveCommand,
        setPlayerCommand,
        setPartyEndCommand,
    } = useWithDispatch(commandsSlice);


    const [isRobotDefendDef, setRobotDefendDef] = useState(false);
    const [isContinueRobotDefendDef, setContinueRobotDefendDef] = useState(false);
    const [isRobotAttackDef, setRobotAttackDef] = useState(false);
    const [isContinueRobotAttackDef, setContinueRobotAttackDef] = useState(false);
    const [isCardsToTrashDef, setCardsToTrashDef] = useState(false);


    useTimeout(_ => goRobotDefend(), 2100, isRobotDefendDef);
    useTimeout(_ => continueRobotDefend(), 1200, isContinueRobotDefendDef);
    useTimeout(_ => goRobotAttack(), 2000, isRobotAttackDef);
    useTimeout(_ => continueRobotAttack(), 1800, isContinueRobotAttackDef);
    useTimeout(_ => setPartyEndCommand('cardsToTrash'), 1800, isCardsToTrashDef);


    useEffect(() => {
        if (!playerCommand) return;
        robotResolver(playerCommand.replace('Again', ''));
    }, [playerCommand])


    function robotResolver(newCommand) {
        switch (newCommand) {
            case 'defendEnemy':
            case 'defendEnemyAfterTransfer':
                setRobotDefendDef(nanoid());
                break;
            case 'continueDefendEnemy':
                setContinueRobotDefendDef(nanoid());
                break;
            case 'attackEnemy':
            case 'attackEnemyAfterSuccesCover':
            case 'attackEnemyAfterFailCover':
                setRobotAttackDef(nanoid());
                break;
            case 'continueAttackEnemy':
                setContinueRobotAttackDef(nanoid());
                break;
            case 'applyRobotMagicCardEffect':
                applyMagicCardEffect(
                    robotState.id,
                    magicCardForApply.current,
                    dataForContinueRobotAttack.current?.isMagicMoveFirst,
                    dataForContinueRobotDefend.current?.isMagicMoveFirst,
                );
                magicCardForApply.current = null;
                break;
            default:
        }
    }


    const isCanAllCover = (...params) =>
        getSimpleCardsForDefend(...params).every(pair => pair.length === 2);

    const isCanTransferDefend = () =>
        !DroppedHelper.getCoveringSimpleCards(droppedCardsState).length &&
        DroppedHelper.isCardsOnBoardEqualDigit(droppedCardsState) &&
        getSimpleCardsForTransfer();


    // extractedCards: одиночные приходят как [{}.{},{},...] парные как [[{}.{}],...]
    function dropRobotMoveCards(extractedCards, isMagic, isTransferDefend) {
        if (!extractedCards.length) {
            baseUtils.logBeauty('dropRobotMoveCards() не пришли карты', 5);
            return;
        }
        let coveredPairs, attackingCards;
        let cardIdsForRemove;
        const paramsForFunc = [
            extractedCards,
            droppedCardsState,
            boardSizes,
            cardSizes
        ]
        const isPairs = Array.isArray(extractedCards[0]);

        if (isPairs) {
            coveredPairs = FinderXYHelper.getPairedCardsWithXY(...paramsForFunc);
            coveredPairs = coveredPairs.map(pair => [
                pair[0],
                {
                    ...pair[1],
                    ownerId: robotState.id
                }
            ])
            addDroppedPairedCards(coveredPairs);
            cardIdsForRemove = coveredPairs.flat().map(card => card.id);
        } else {
            attackingCards = FinderXYHelper.getSingleCardsWithXY(...paramsForFunc);
            attackingCards = attackingCards.map(card => ({
                ...card,
                ownerId: robotState.id
            }));
            addDroppedSingleCards(attackingCards);
            cardIdsForRemove = attackingCards.map(card => card.id);
        }
        removePlayerCardsByIds({ playerId: robotState.id, data: cardIdsForRemove });
        if (isMagic) {
            magicCardForApply.current = attackingCards[0];
            setPlayerCommand('applyRobotMagicCardEffect');
        }
        audioPlayer.playSoundAfterDrop(isMagic || isTransferDefend, isPairs);
    }

    // компьютер атакует (или повторно атакует)
    // схема проста: комп либо ток простыми ходит, либо ток магическими,
    // либо простыми + магической, причем может сначала магической потом обычными и наоборот
    const goRobotAttack = () => {
        let extractedSimpleCards = getSimpleCardsForAttack(false, userState.simpleCards.length);
        const isWillMagicCard = settingsState.isFoolWithMagic && baseUtils.toss(0.9);
        const isMagicMoveFirst = !extractedSimpleCards.length ? true : baseUtils.toss(0.5);
        // TODO: возможно не следует согласовать кол-во карт для атаки с кол-вом простых карт у чела
        let extractedMagicCard = isWillMagicCard ? getMagicCardsForAttack(isMagicMoveFirst) : null;
        let magicKey = extractedMagicCard ? getMagicKeyByNum(extractedMagicCard.num) : null;
        // если магическая карта несовместима с отобранными простыми
        // тогда отказываемся от простых
        // TODO: может быть наоборот
        if (extractedMagicCard && ['reset_card', 'repeat_card'].includes(magicKey)) {
            extractedSimpleCards = [];
            //extractedMagicCard = null;
            //magicKey = null;
        }

        if (loserId) {
            // чед сдался и берет карты
            if (extractedSimpleCards.length &&
                extractedSimpleCards.length < userState.simpleCards.length) {
                dropRobotMoveCards(extractedSimpleCards, false);
                // неплохо бы задержку 2сек
                setCardsToTrashDef(nanoid());
            } else {
                setPartyEndCommand('cardsToTrash');
            }
        }
        // чел отбился:
        // TODO: может быть при отсутствии у чела карт все равно повторно атаковать
        //  он ведь может из колоды до 3х карт брать или магической перевести
        else if (isForbiddenattackUserRepeat(extractedSimpleCards, extractedMagicCard)) {
            setPartyEndCommand('cardsToTrash');
        } else if (extractedMagicCard && !extractedSimpleCards.length) {
            // нечем больше атаковать, ходим ток магической картой
            dropRobotMoveCards([extractedMagicCard], true);
        } else if (!extractedMagicCard && extractedSimpleCards.length) {
            // ходим ток обычными
            dropRobotMoveCards(extractedSimpleCards, false);
            setNextMoveCommand('defendUser');
        } else if (extractedMagicCard && extractedSimpleCards.length) {
            // ходим как обычными, так и магической, очередность на основе жребия
            const firstMoveCards = isMagicMoveFirst ? [extractedMagicCard] : extractedSimpleCards;
            dataForContinueRobotAttack.current = {
                isMagicMoveFirst,
                extractedSimpleCards,
                extractedMagicCard,
                magicKey
            }
            dropRobotMoveCards(firstMoveCards, isMagicMoveFirst);
            if (!isMagicMoveFirst) {
                // робот сходил простой картой, продолжим атаку магической
                setPlayerCommand('continueAttackEnemy');
            } else {
                // робот сходил магической
                // useMagicApply после применения магии вызовет continueAttackEnemy
            }
        } else {
            baseUtils.logBeauty('goRobotAttack() непредвиденный else', 5)
        }
    };

    // робот атакует двумя видами карт: и простой и магической картой
    // здесь робот вторым видом карт сходит(он определялся ранее рандомным образом)
    const continueRobotAttack = () => {
        let {
            isMagicMoveFirst,
            extractedSimpleCards,
            extractedMagicCard,
            magicKey
        } = dataForContinueRobotAttack.current;
        // получили данные и очистим навсяки
        dataForContinueRobotAttack.current = null;
        // если сперва ходили магией, то простые карты могли поменяться
        if (isMagicMoveFirst) {
            extractedSimpleCards =
                getSimpleCardsForAttack();
        }
        const secondMoveCards = isMagicMoveFirst ? extractedSimpleCards : [extractedMagicCard];
        dropRobotMoveCards(secondMoveCards, !isMagicMoveFirst);
        // если сходили обычной картой - надо челу передать защиту
        if (isMagicMoveFirst) {
            setNextMoveCommand('defendUser');
        }
    }

    const goRobotDefend = () => {
        let isCanCover = isCanAllCover();
        // не всегда хочется переводить защиту напарнику, поэтому жребий кидаем
        let isCanTransfer = settingsState.isFoolWithTransfer && isCanTransferDefend() &&
            !loserId && userState.simpleCards.length &&
            baseUtils.toss(isCanCover ? 0.4 : 0.8);
        const getMagicCardsByKeys = (keyList) => {
            const resultCards = robotState.magicCards
                .filter(card => getMagicNumsByKeys(keyList).some(num => num === card.num))
                // удаляем те магические карты, которыми уже ходили
                .filter(card => !DroppedHelper.isExistCurrentMagicOnBoard(
                    card, robotState.id, droppedCardsState));
            if (keyList.includes('trump_change') || keyList.includes('gift_pack')) {
                return resultCards;
            } else {
                return resultCards[0];
            }
        }
        let transferMagicCard, lampMagicCard, defendHelperCard;
        const isExistTrumpTuzOnBoard = DroppedHelper.isExistTrumpTuzOnBoard(droppedCardsState, trump.suit);

        if (settingsState.isFoolWithMagic && !(isCanCover || isCanTransfer)) {
            transferMagicCard = userState.simpleCards.length && getMagicCardsByKeys(['transfer_card']);
            lampMagicCard = !isExistTrumpTuzOnBoard ? getMagicCardsByKeys(['lamp_card']) : null;
            defendHelperCard = getDefendHelperCard({
                trump_change: getMagicCardsByKeys(['trump_change']),
                gift_pack: getMagicCardsByKeys(['gift_pack']),
                // TODO: возможно в будущем убрать robotState.simpleCards.length
                //  пока чел не поймет, если у него вдруг колода опустеет
                exchange_card: userState.simpleCards.length && robotState.simpleCards.length &&
                    getMagicCardsByKeys(['exchange_card'])
            });
        }

        let coveredSimplePairs;
        if (isCanCover || isCanTransfer) {
            coveredSimplePairs = isCanTransfer ?
                getSimpleCardsForTransfer() : getSimpleCardsForDefend();
            // в случае перевода защиты на напарника придет [{}] иначе [[{},{}],...]
            dropRobotMoveCards(coveredSimplePairs, false, !isCanCover);
            if (isCanTransfer) {
                setNextMoveCommand('transferDefend');
            } else {
                // робот отбился, ждем повторной атаки
                setNextMoveCommand('completePartyOrRepeatAttack');
            }
        } else if (defendHelperCard) {
            dataForContinueRobotDefend.current = {
                isMagicMoveFirst: true
            };
            dropRobotMoveCards([defendHelperCard], true);
            // useMagicApply после применения магии вызовет continueAttackEnemy
        } else if (lampMagicCard) {
            dropRobotMoveCards([lampMagicCard], true);
            // карта передаст ход челу
        } else if (transferMagicCard) {
            dropRobotMoveCards([transferMagicCard], true);
            // карта передаст ход челу
        } else {
            // нечем крыть и магических вспомогательных нет - просто берем карты
            setNextMoveCommand('cannotCoverCards');
        }
    }

    // робот ранее сходил магической картой (defendHelperCard), меняющей колоду
    // теперь он может отбиться обычными картами из своей колоды(или ранее обмененной)
    const continueRobotDefend = () => {
        dataForContinueRobotDefend.current = null;
        const coveredSimplePairs = getSimpleCardsForDefend();
        // TODO: косяк, юзер успевает каким-то образом мгновенно сходить новой картой
        // и даже после применения супер-карты все карты на доске покрыть не удастся
        // пока не понятно, как чинить, поэтому временная загрушка
        const isCanNotCoverAllCardsOnDesk = coveredSimplePairs.flat().some(card => !card.id);
        if (isCanNotCoverAllCardsOnDesk) {
            setNextMoveCommand('cannotCoverCards');
        } else {
            dropRobotMoveCards(coveredSimplePairs, false, false);
            setNextMoveCommand('completePartyOrRepeatAttack');
        }
    }


    const isForbiddenattackUserRepeat = (extractedSimpleCards, extractedMagicCard) => {
        // +3 -магические карты, +2 -навсяки с запасом
        const cardsOnBoardQty = DroppedHelper.getCoveringSimpleCards(droppedCardsState).length;
        const badUserCardsOffset = cardSizes.cardWidth / 2 + 10;
        const userCardsQtyFuture = userState.simpleCards.length + 3 + cardsOnBoardQty * 2 + 1;
        const isUserCardsLimitExceed = CardsHelper.getCardVisualOffset(
            cardSizes, boardSizes, userCardsQtyFuture) >= badUserCardsOffset;
        let isNoSpaceForNewCard = FinderXYHelper.getSingleCardsWithXY(
            extractedSimpleCards,
            droppedCardsState,
            boardSizes,
            cardSizes,
            true
        );
        return cardsOnBoardQty && (!userState.simpleCards.length ||
            (!extractedMagicCard && !extractedSimpleCards.length) ||
            isUserCardsLimitExceed || isNoSpaceForNewCard);
    }


    // вернет магическую карту (смена козыря или карту обмена) если они есть у компа
    // и если помогут отбиться
    // для карт козыря и подарочного набора придут массивы, для остальных сама карта
    const getDefendHelperCard = (magicCards) => {
        let helperCards = [];
        const robotSimpleCards = robotState.simpleCards;
        const checkCoverUserCards = (card, simpleCards, trumpSuit, droppedCards) => {
            if (isCanAllCover(trumpSuit, simpleCards, droppedCards)) {
                helperCards.push(card);
            }
        }
        for (const key in magicCards) {
            if (magicCards[key]) {
                switch (key) {
                    case 'gift_pack': {
                        magicCards[key].forEach(card => {
                            const robotCardsResult = [
                                ...robotSimpleCards,
                                ...CardsHelper.getPackWithEqualDigit(card.packDigit)
                            ];
                            checkCoverUserCards(card, robotCardsResult);
                        });
                        break;
                    }
                    case 'trump_change':
                        magicCards[key].forEach(card => {
                            checkCoverUserCards(card, null, card.modi);
                        });
                        break;
                    case 'exchange_card':
                        /* updatePlayerCard(robotState.id, {
                            simpleCards: userState.simpleCards,
                            magicCards: userState.magicCards
                        });
                        updatePlayerCard(userState.id, {
                            simpleCards: robotState.simpleCards,
                            magicCards: robotState.magicCards
                        });
                        const robotCardsResult = [
                            ...CardsHelper.getOtherPlayerSwitchedCards(userState, true, openedMagicKeys, trump.suit)
                                .simpleCards
                        ]; */
                        //checkCoverUserCards(magicCards[key], robotCardsResult);
                        break;
                    default:
                        baseUtils.logBeauty('getDefendHelperCard() unknown', 5);
                }
            }
        }
        return helperCards.length ? baseUtils.randFromArrayObject(helperCards) : null;
    }

    const getMagicCardsForAttack = (isFirstMove) => {
        const magicCardsRobot = robotState.magicCards;
        let magicItems = magicCardsRobot
            // чтоб повторно не сходить той же магической картой
            .filter(card => !DroppedHelper.isExistCurrentMagicOnBoard(
                card, robotState.id, droppedCardsState))
            .map(card => getMagicItemByProp('num', card.num));
        const coveringCardsQty = DroppedHelper.getCoveringSimpleCards(droppedCardsState).length;
        // оставляем только карты для атаки
        magicItems = magicItems.filter(item => item.forAttack === true);
        // у чела не осталось простых карт, удаляем карты атаки:
        // "повторная атака", "сброс ранее покрытых"
        if (!userState.simpleCards.length) {
            magicItems = magicItems.filter(item => !['reset_card', 'repeat_card'].includes(item.key));
        }
        // если козыри совпадают нечего и менять
        if (trump.suit === magicCardsRobot.find(card => card.key === 'trump_change')?.modi) {
            magicItems = magicItems.filter(item => item.key !== 'trump_change');
        }
        // если пар меньше 2 или больше 5 не ходим
        if (coveringCardsQty < 2 || coveringCardsQty > 5) {
            magicItems = magicItems.filter(item => item.key !== 'reset_card');
        }
        // если не первый ход и чел отбивался только джокером,
        // тогда нечего и запускать повторное покрытие
        if (!isFirstMove || !DroppedHelper.getCoveringSimpleCards(droppedCardsState).length) {
            magicItems = magicItems.filter(item => item.key !== 'repeat_card');
        }
        let resultCard;
        if (magicItems.length) {
            const randItem = baseUtils.randFromArrayObject(magicItems);
            resultCard = magicCardsRobot.find(card => card.num === randItem.num);
        } else {
            resultCard = null;
        }
        return resultCard;
    }


    // получить карты, чтобы покрыть
    //playerSimpleCards - карты робота, если режим проверки магической карты - то карты чела, возможно
    const getSimpleCardsForDefend = (trumpSuit, playerSimpleCards, droppedCards) => {
        trumpSuit = trumpSuit || trump.suit;
        playerSimpleCards = playerSimpleCards || robotState.simpleCards;
        droppedCards = droppedCards || DroppedHelper.getUncoveredSimplePairs(droppedCardsState);
        // делим личные карты на обычные и козыри
        let simpleCards = [];
        let trumpCards = [];
        // если вдруг придут оригинальные карты робота, а их менять нельзя
        [...playerSimpleCards]
            // сортируем, чтобы, например, не покрыть королем 6-ку когда он нужен, чтобы покрыть даму
            .sort((cardA, cardB) => cardA.digit - cardB.digit)
            .forEach(card => {
                if (card.suit === trumpSuit) {
                    trumpCards.push(card);
                } else {
                    simpleCards.push(card);
                }
            });

        // возвращаем пары покрытые и непокрытые
        return droppedCards
            .map(pair => {
                let coveringCard = simpleCards.find(perCard =>
                    CardsHelper.isMorePowerSecond(pair[0], perCard, trumpSuit));
                if (coveringCard) {
                    simpleCards = simpleCards.filter(card => card.id !== coveringCard.id);
                }
                return coveringCard ? pair.concat(coveringCard) : pair;
            })
            .map(pair => {
                if (pair.length === 2) return pair;
                let coveringCard = trumpCards.find(perCard =>
                    CardsHelper.isMorePowerSecond(pair[0], perCard, trumpSuit));
                if (coveringCard) {
                    trumpCards = trumpCards.filter(card => card.id !== coveringCard.id);
                }
                return coveringCard ? pair.concat(coveringCard) : pair;
            });
    };

    const getSimpleCardsForTransfer = () => {
        const uncoveredCards = DroppedHelper.getUncoveredSimplePairs(droppedCardsState);
        const transferCard = robotState.simpleCards
            .find(card => uncoveredCards.some(pair => card.digit === pair[0].digit))
        return transferCard ? [transferCard] : null;
    }

    // возвращает карты для атаки для компа
    const getSimpleCardsForAttack = (unrelatedQty, maxQty) => {
        const attackCards = DroppedHelper.isExistAnySimpleOnBoard(droppedCardsState) ?
            getRepeatAttackCards() : getFirstAttackCards(unrelatedQty);
        let resultCards = baseUtils.shuffle(attackCards);
        resultCards = resultCards.slice(0, unrelatedQty || maxQty || baseUtils.randAB(1, robotState.simpleCards.length));
        return resultCards;
    };

    // получить карты, чтоб атаковать напарника вторично по сходившим картам
    const getRepeatAttackCards = () => {
        const defendedCards = DroppedHelper.getCoveringSimpleCards(droppedCardsState);
        const equalUserCards = robotState.simpleCards.filter(perCard =>
            defendedCards.some(defCard => perCard.digit === defCard.digit));
        equalUserCards.sort((cardA, cardB) => cardA.digit - cardB.digit);
        return equalUserCards;
    };

    // сортирует карты компьютера по группам и принимает решение, какими картами компьютер будет ходить
    const getFirstAttackCards = (unrelatedQty) => {
        const robotCards = [...robotState.simpleCards];
        // карты компьютера поделены на 3 группы:
        // самые слабые карты, одинаковые по достоинству карты, козыри
        // могут попасть пары и с козырем, ну и ладно
        let equalRobotCards = getEqualDigitCardsObj(robotCards, trump.suit) || [];
        let weakCards = robotCards.sort((cardA, cardB) => cardA.digit - cardB.digit);

        let result;
        if (unrelatedQty) {
            const randomCards = baseUtils.toss(0.6) ? weakCards : baseUtils.shuffle(robotCards);
            result = randomCards.slice(0, unrelatedQty);
            // уменьшаем вероятность хождения козырями
        } else if (equalRobotCards.length && baseUtils.toss(0.6)) {
            result = equalRobotCards;
        } else {
            let strongWeakCards = weakCards.filter(card => card.suit !== trump.suit);
            // слабых некозырных карт может и не быть, тогда просто отсортированный по возрастанию массив записываем
            weakCards = strongWeakCards.length ? strongWeakCards : weakCards;
            result = baseUtils.toss(0.7) ? weakCards[0] : baseUtils.randFromArrayObject(robotCards);
            result = [result];
        }
        return result;
    };

    // получаем группы карт с одинаковыми цифрами(достоинством)
    const getEqualGroups = (cards) => {
        const groups = {};
        cards.forEach(card => {
            if (groups[card.digit]) {
                groups[card.digit].push(card);
            } else {
                groups[card.digit] = [card];
            }
        });
        return groups;
    }

    // получить карты с таким же достоинством
    const getEqualDigitCardsObj = (cards, trumpSuit) => {
        const equalCards = [];
        // группируем карты по цифре
        const groups = getEqualGroups(cards);
        // если ключи цифры, for пробегает, начиная от меньшей цифры
        for (let key in groups) {
            let cards = groups[key];
            if (cards.length > 1) equalCards.push(cards);
        }
        // исключаем пары с козырем
        const equalNonTrump = equalCards.filter(cards =>
            cards.every(card => card.suit !== trumpSuit));
        // извлекаем самую слабую по цифре пару
        return (equalNonTrump.length ? equalNonTrump[0] : equalCards[0]) || [];
    };

    return {
        goRobotAttack,
        goRobotDefend,
    }
}