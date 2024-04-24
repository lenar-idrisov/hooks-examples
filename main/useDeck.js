// @ts-nocheck
import * as baseUtils from "../../helpers/baseUtils";
import { getAllMagicKeys, getMagicKeyByNum, getMagicNumsByKeys } from "../../constants/magicList";
import { useSelector } from "react-redux";
import useWithDispatch from "../base/useWithDispatch";
import { deckSlice } from "../../store/reducers/deck";
import { playersSlice } from "../../store/reducers/players";
import CardsHelper from "../../helpers/CardsHelper";
import { getCardsToGamer } from "../../api/getDataOnline";
import { nanoid } from "nanoid";


// подготовка колоды (простой и магической) до начала игры
export default function useDeck() {
    const settingsState = useSelector(state => state.settings);
    const deckState = useSelector(state => state.deck);
    const [userState, robotState] = useSelector(state => state.players);
    const { loserId } = useSelector(state => state.party);

    const { updateDeck, removeDeckSimpleCardsByIds } = useWithDispatch(deckSlice);
    const {
        addPlayerSimpleCards,
        addPlayerMagicCards,
        removePlayerCardsByIds,
        setNextMagicNums
    } = useWithDispatch(playersSlice);


    // добавляем доп карты челу
    const addTrialCard = () => {
        if (settingsState.isGameWithRobot) {
            addPlayerSimpleCards({ playerId: userState.id, data: pullOutSimpleCards(1) })
        } else {
            getCardsToGamer(1, userState.simpleCards.length, (receivedCards) => {
                addPlayerSimpleCards({ playerId: userState.id, data: receivedCards });
            })
        }
    }

    // подготавливаем колоду
    const prepareInitialDeck = () => {
        // после перезапуска игры пригодится исходная колода
        const newDeck = {
            simpleCards: [],
            simpleCardsBasic: deckState.simpleCardsBasic,
            magicCards: deckState.magicCards.map(card => ({ ...card })),
        };

        const pushDuplicatedCards = (qty) => {
            for (let i = 1; i <= qty; i++) {
                newDeck.simpleCards.push(...deckState.simpleCardsBasic);
            }
        }
        // увеличиваем колоду
        pushDuplicatedCards(settingsState.isBigDeck ? 2 : 1);
        // тасуем колоду
        newDeck.simpleCards = baseUtils.shuffle(newDeck.simpleCards);
        // зашиваем id карты
        // получаем новый независимый объект для каждой карты
        newDeck.simpleCards = newDeck.simpleCards.map(card => ({
            ...card,
            id: card.path + '$' + nanoid(),
        }));
        updateDeck(newDeck);
    }

    // взять случайные простые карты из колоды (удалив их оттуда)
    const pullOutSimpleCards = (qty, excludedCards = []) => {
        const deckSimpleCards = deckState.simpleCards
            .filter(card => excludedCards.every(exCard => exCard.id !== card.id));

        // если карт в колоде меньше, корректируем кол-во
        if (qty > deckSimpleCards.length) {
            qty = deckSimpleCards.length;
        }
        if (!qty) return [];

        // карты в колоде для игрока уже точно есть
        let cards = deckSimpleCards.slice(0, qty);
        cards = cards.map(card => ({ ...card }));
        const cardsIds = cards.map(card => card.id);
        removeDeckSimpleCardsByIds(cardsIds);
        return cards;
    }

    // получить заданное кол-во магических карт из колоды (не удаляя их оттуда)
    const pullOutMagicCards = (playerId, cardsQty, trumpSuit) => {
        const nextCardNums = pullOutNextCardNums(playerId, cardsQty);
        return nextCardNums.map(nextNum => {
            const nextCardKey = getMagicKeyByNum(nextNum);
            const randomMagicCards = baseUtils.shuffle(deckState.magicCards);
            const magicCard = randomMagicCards.find(card =>
                card.num === nextNum &&
                // если карта смена козыря, убираем совпадение с текущим козырем
                (nextCardKey !== 'trump_change' ||
                    (nextCardKey === 'trump_change' && card.modi !== trumpSuit))
            );
            const card = {
                ...magicCard,
                id: magicCard.path + '@' + nanoid(),
            }
            if (nextCardKey === 'gift_pack') {
                // получаем случайное достоинство карты: от туза до валета
                card.packDigit = baseUtils.randFromArrayObject([50, 40, 30, 20]);
            }
            return card;
        });
    }

    // идея: рандомайзер все равно хреново рандомит
    // решение: берем номера всех 12 карт, тасуем + 6 случайных номеров (для эффекта спонтанной выдачи)
    // также прибавляем по желанию номера карт, желательных для более частого повторения
    const pullOutNextCardNums = (playerId, numsQty) => {
        let cardNums = userState.id === playerId ?
            userState.nextMagicNums : robotState.nextMagicNums;
        // данные из state нельзя модифицировать вручную
        cardNums = [...cardNums];
        if (!cardNums.length) {
            // let magicKeys = playerId === userState.id ? openedMagicKeys : getAllMagicKeys();
            let magicKeys = getAllMagicKeys();
            magicKeys = [
                ...baseUtils.shuffle(magicKeys),
                // повышаем случайность выдаваемых карт, добавляем 6 случайных
                // чтобы по очереди 12 карт не выдавались
                ...baseUtils.shuffle(magicKeys).slice(0, 6),
            ];
            /* magicKeys = [
                'exchange_card',
                'exchange_card',
                'exchange_card',
            ]; */
            // TODO: пока так для ознакомления людей со всеми картами,
            //  в будущем еще раз рандомить надо здесь 1 раз, сверху уже нет
            //  т.к сначала рядком 12 карт получим и только потом остальные 6
            cardNums = getMagicNumsByKeys(magicKeys);
        }

        const extractedNums = cardNums.splice(0, numsQty);
        setNextMagicNums({ playerId, data: cardNums });
        return extractedNums;
    }

    function autoPushCards(pickUppedCardsQty, trumpSuit) {
        pushMagicCards(trumpSuit);
        !settingsState.isGameWithRobot ?
            pushSimpleCardsOnline(pickUppedCardsQty) :
            pushSimpleCardsOffline(pickUppedCardsQty);
    }

    // после каждой партии автоматически заполняем рандомными картами личный состав карт игроков
    function pushSimpleCardsOnline(pickUppedCardsQty = 0) {
        const playerId = userState.id;
        // если карта смены козыря совпадает с текущим козырем - убираем ее из колоды игрока
        const missingQty = CardsHelper.getMissingCardsQty(userState);
        let simpleQty = missingQty.simpleCards;
        if (playerId === loserId) {
            simpleQty = simpleQty - pickUppedCardsQty
        }
        if (simpleQty > 0) {
            getCardsToGamer(simpleQty, userState.simpleCards.length, (receivedCards) => {
                if (receivedCards.length) {
                    addPlayerSimpleCards({ playerId, data: receivedCards });
                }
            });
        }
    }

    // после каждой партии автоматически заполняем рандомными картами личный состав карт игроков
    function pushSimpleCardsOffline(pickUppedCardsQty = 0) {
        let pullOutedCards = [];
        const push = (player) => {
            const playerId = player.id;
            // если карта смены козыря совпадает с текущим козырем - убираем ее из колоды игрока
            const missingQty = CardsHelper.getMissingCardsQty(player);
            let simpleQty = missingQty.simpleCards;
            if (playerId === loserId) {
                simpleQty = simpleQty - pickUppedCardsQty
            }
            if (simpleQty > 0) {
                pullOutedCards = pullOutSimpleCards(simpleQty, pullOutedCards);
                if (pullOutedCards.length) {
                    addPlayerSimpleCards({ playerId, data: pullOutedCards });
                }
            }
        }
        // сначала берет карты тот, у кого карт меньше
        if (userState.simpleCards.length < robotState.simpleCards.length) {
            push(userState);
            push(robotState);
        } else {
            push(robotState);
            push(userState);
        }
    }


    function pushMagicCards(trumpSuit) {
        const push = (player) => {
            const playerId = player.id;
            // если карта смены козыря совпадает с текущим козырем - убираем ее из колоды игрока
            const uselessMagicCardsIds = player.magicCards
                .filter(card => getMagicKeyByNum(card.num) === 'trump_change' && card.modi === trumpSuit)
                .map(card => card.id);
            const missingQty = CardsHelper.getMissingCardsQty(player);
            const magicQty = missingQty.magicCards + uselessMagicCardsIds.length;

            if (magicQty > 0 && settingsState.isFoolWithMagic) {
                if (uselessMagicCardsIds.length) {
                    removePlayerCardsByIds({ playerId, data: uselessMagicCardsIds });
                }
                addPlayerMagicCards({ playerId, data: pullOutMagicCards(playerId, magicQty, trumpSuit) })
            }
        }
        push(userState);
        if (settingsState.isGameWithRobot) {
            push(robotState);
        }
    }


    return {
        prepareInitialDeck,
        autoPushCards,
        addTrialCard
    };
}