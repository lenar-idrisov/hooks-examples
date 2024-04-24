import * as baseUtils from "../../helpers/baseUtils";
import { getMagicItemByProp } from "../../constants/magicList";
import { useSelector } from "react-redux";
import DroppedHelper from "../../helpers/DroppedHelper";
import CardsHelper from "../../helpers/CardsHelper";
import useWithDispatch from "../base/useWithDispatch";
import { droppedCardsSlice } from "../../store/reducers/droppedCards";
import { playersSlice } from "../../store/reducers/players";
import { useContext, useEffect, useRef } from "react";
import { AudioPlayerContext } from "../../index";
import { partySlice } from "../../store/reducers/party";
import { commandsSlice } from "../../store/reducers/commands";
import { sendDroppedCards } from "../../api/sendDataOnline";


// нужен для получения карт для атаки/защиты
// и закрепления координат за сходившими картами
export default function useUser({
    deckWorker,
    applyMagicCardEffect,
    boardSizes,
    cardSizes,
}) {
    const audioPlayer = useContext(AudioPlayerContext);
    const magicCardForApply = useRef(null);
    const settingsState = useSelector(state => state.settings);
    const droppedCardsState = useSelector(state => state.droppedCards);
    const deckState = useSelector(state => state.deck);
    const { trump, isGameFrozen } = useSelector(state => state.app);
    const [userState, robotState] = useSelector(state => state.players);
    const { playerCommand, infoCommand } = useSelector(state => state.commands);
    const userDroppedState = useSelector(state => state.userDropped);
    const { friendCardsQty, deckOnlineQty } = useSelector(state => state.onlineData);
    const {
        attackId,
        loserId,
        trialCardsQty
    } = useSelector(state => state.party);

    const { isPartyFrozen } = useSelector(state => state.party);
    const isFrozen = isGameFrozen || isPartyFrozen;


    const { removePlayerCardsByIds } = useWithDispatch(playersSlice);
    const { increaseTrialCardsLimitQty } = useWithDispatch(partySlice);
    const { addDroppedPairedCards, addDroppedSingleCards } = useWithDispatch(droppedCardsSlice);
    const {
        setNextMoveCommand,
        setPlayerCommand,
        setInfoCommand
    } = useWithDispatch(commandsSlice);

    const finalEnemyCardsQty = settingsState.isGameWithRobot ?
        robotState.simpleCards.length : friendCardsQty;

    const finalDeckQty = settingsState.isGameWithRobot ?
        deckState.simpleCards.length : deckOnlineQty;

    useEffect(() => {
        if (!playerCommand) return;
        userResolver(playerCommand.replace('Again', ''));
    }, [playerCommand])


    function userResolver(newCommand) {
        switch (newCommand) {
            case 'getTrialCard':
                addUserTrialCard();
                break;
            case 'resolveUserDropped':
                // событие приходит из UserPack
                userState.id === attackId ?
                    goUserAttack(userDroppedState) :
                    goUserDefend(userDroppedState);
                break;
            case 'applyUserMagicCardEffect':
                applyMagicCardEffect(userState.id, magicCardForApply.current);
                magicCardForApply.current = null;
                break;
            default:
        }
    }


    // добавляет случайную карту из колоды игроку из колоды,
    // если он ему нечем крыть и он сам нажал на колоду
    async function addUserTrialCard() {
        if (isFrozen) return;
        let error;
        if ([
            'failNoCardsInDeck',
            'failLimitTrialCards',
            'failTrialCardAfterLoser'
        ].includes(infoCommand)) {
            return;
        }
        if (!finalDeckQty) {
            error = 'failNoCardsInDeck';
        } else if (!trialCardsQty) {
            error = 'failLimitTrialCards';
        } else if (loserId) {
            error = 'failTrialCardAfterLoser';
        }

        if (error) {
            setInfoCommand(error);
        } else {
            audioPlayer.play('dropSimple');
            increaseTrialCardsLimitQty();
            deckWorker.addTrialCard();
        }
    }

    // узнаем, можно ли чел сходить магической картой
    const getMagicCardError = (magicCard) => {
        if (!magicCard.num) return;
        const magicItem = getMagicItemByProp('num', magicCard.num);
        const coveringCardsQty = DroppedHelper.getCoveringSimpleCards(droppedCardsState).length;
        const isAttackMode = userState.id === attackId;
        const isExistTrumpTuzOnBoard = DroppedHelper.isExistTrumpTuzOnBoard(droppedCardsState, trump.suit);
        const enemyCardsQty = settingsState.isGameWithRobot ?
            robotState.simpleCards.length : finalEnemyCardsQty;
        let error;

        if (loserId) {
            error = 'failCardBeforeEndParty';
        } else if (DroppedHelper.isExistCurrentMagicOnBoard(magicCard, userState.id, droppedCardsState)) {
            // проверка, что ранее не ходили этой магической картой
            error = 'failMagicRepeat';
        } else if (isAttackMode && magicItem.forAttack === false) {
            // проверка, что атакующий(отбивающийся) ходит магической картой для атаки(защиты)
            error = 'failDefendPlayer';
        } else if (!isAttackMode && magicItem.forAttack === true) {
            error = 'failAttackPlayer';
        }

        if (!error) {
            switch (magicItem.key) {
                case 'transfer_card':
                    if (!enemyCardsQty) {
                        error = 'failEnemyNoCardsLeft';
                    }
                    break;
                case 'lamp_card':
                    if (isExistTrumpTuzOnBoard) {
                        error = 'failLampCardWhenTuzOnBoard';
                    }
                    break;
                case 'repeat_card':
                case 'reset_card':
                    if (!coveringCardsQty) {
                        error = 'failRepeatAndResetMove';
                    }
                    break;
                case 'exchange_card':
                    if (!enemyCardsQty) {
                        error = 'failExchangeCard';
                    }
                    break;
                default:
            }
        }
        return error;
    }

    // проверка верно сходил чел
    const getFailMoveError = (currentCard, intersectedCards, droppedXY, coveredCard) => {
        let errorMess;
        // узнаем, разрешен ли перевод защиты на напарника
        const isTransferDefendForbidden = !settingsState.isFoolWithTransfer || loserId ||
            DroppedHelper.getCoveringSimpleCards(droppedCardsState).length;
        const finalCardDigit = currentCard.num ? null : currentCard.digit;
        // узнаем, может ли положенная карта перевести защиту на напарника
        const isPossibleTransferDefend = !isTransferDefendForbidden ?
            DroppedHelper.getUncoveredSimplePairs(droppedCardsState)
                .some(pair => pair[0].digit === finalCardDigit) : null;
        const magicError = currentCard.num ? getMagicCardError(currentCard) : null;
        const enemyCardsQty = settingsState.isGameWithRobot ?
            robotState.simpleCards.length : finalEnemyCardsQty;

        // если карты с таким id в колоде чела вдруг не оказалось
        // может произойти, когда наехали события
        if (![...userState.simpleCards, ...userState.magicCards]
            .find(card => card.id === currentCard.id)) {
            baseUtils.logBeauty('getFailMoveError() failNoCardId', 5);
            return 'failNoCardId';
        }
        if (DroppedHelper.isOutBoard(droppedXY, boardSizes)) {
            // карта вне поля
            errorMess = 'failDrop';
        } else if (magicError) {
            // магическую карту неверно использовали
            errorMess = magicError;
        } else if (userState.id === attackId) {
            // атакующий игрок может много раз ходить, даже если не активен
            // картой атаковали
            if (DroppedHelper.getUncoveredSimplePairs(droppedCardsState).length + 1 > finalEnemyCardsQty &&
                DroppedHelper.isExistAnySimpleOnBoard(droppedCardsState) && !loserId) {
                // У противника не хватает карт, чтобы отбиться
                errorMess = 'failEnemyCardsNotEnougth';
            } else if (!currentCard.num &&
                DroppedHelper.isExistAnySimpleOnBoard(droppedCardsState) &&
                !CardsHelper.isValidAttackedCard(finalCardDigit, droppedCardsState)) {
                // атаковать данной картой нельзя
                errorMess = 'failMoveAttack';
            } else if (intersectedCards.length) {
                // пересекается с другими картами
                errorMess = 'failDrop';
            }
        } else {
            if (!currentCard.num) {
                // положили обычную карту
                if (intersectedCards.length > 1) {
                    // снизу 2 карты и неясно какую покрывали
                    errorMess = 'failUnknownDrop';
                } else if (intersectedCards.length === 1 && !coveredCard) {
                    // положенная на карту напарника карта не покрывает ее
                    errorMess = 'failMoveDefend';
                } else if (!intersectedCards.length && isTransferDefendForbidden) {
                    // не положили на карту напарника
                    errorMess = 'failDrop';
                } else if (!intersectedCards.length && !isPossibleTransferDefend) {
                    // пытались перевести защиту, но не получится этой картой
                    errorMess = 'failTransferDefend';
                } else if (!intersectedCards.length && !enemyCardsQty) {
                    // пытались перевести защиту, но у противника не осталось карт
                    errorMess = 'failEnemyNoCardsLeft';
                }
            } else if (intersectedCards.length) {
                // магическую положили на карту напарника
                errorMess = 'failDropSuper';
            }
        }
        return errorMess;
    }

    // extractedCards: одиночные приходят как [{}] парные как [[{},{}]]
    const dropUserMoveCards = (extractedCards, droppedId, droppedXY, isTransferDefend) => {
        if (!extractedCards.length) {
            baseUtils.logBeauty('dropUserMoveCards() не пришли карты', 2);
            return;
        }
        let coveredCard, coveringCard;
        let attackingCard;
        let isMagic = false;
        const additionalCardsAttrs = { ...droppedXY, ownerId: userState.id };
        const isPair = Array.isArray(extractedCards[0]);

        if (isPair) {
            [coveredCard, coveringCard] = extractedCards[0];
            coveringCard = { ...coveringCard, ...additionalCardsAttrs };
            addDroppedPairedCards([[coveredCard, coveringCard]]);
        } else {
            attackingCard = extractedCards[0];
            attackingCard = { ...attackingCard, ...additionalCardsAttrs, };
            addDroppedSingleCards([attackingCard])
            isMagic = !!attackingCard.num;
        }
        removePlayerCardsByIds({ playerId: userState.id, data: [droppedId] });
        if (isMagic) {
            magicCardForApply.current = attackingCard;
            setPlayerCommand('applyUserMagicCardEffect');
        }
        audioPlayer.playSoundAfterDrop(isMagic || isTransferDefend, isPair);
        if (!settingsState.isGameWithRobot) {
            sendDroppedCards(
                {
                    cards: isPair ? [[coveredCard, coveringCard]] : [attackingCard],
                    isPair,
                    isMagic
                },
                isMagic ? null : userState.simpleCards.length - 1
            );
        }
    }

    const goUserAttack = (droppedCardData) => {
        const { droppedId, droppedXY } = droppedCardData;
        const intersectedCards = DroppedHelper.getIntersected(
            droppedXY, droppedCardsState, cardSizes);
        let attackingCard = CardsHelper.getCardById(userState, droppedId);
        // проверяем, можно ли положить карту на поле
        const failMoveError = getFailMoveError(attackingCard, intersectedCards, droppedXY);

        if (failMoveError) {
            if (failMoveError === 'failNoCardId') return;
            setInfoCommand(failMoveError);
        } else {
            // все норм, кладем карту на поле
            dropUserMoveCards([attackingCard], droppedId, droppedXY);
            // ждем нажатия кнопки "бито" = "больше карт нет"
            if (loserId) return;
            // атакующий может 
            if (attackingCard.suit &&
                // !!! единственное 1 место, где droppedCards прежнее,
                // т.к dropUserMoveCards еще не обновил состояние
                !DroppedHelper.getUncoveredSimplePairs(droppedCardsState).length) {
                // сходили простой картой
                setNextMoveCommand('defendEnemy');
            } else {
                // магическая карта сама все сделает
            }
        }
    };

    const goUserDefend = (droppedCardData) => {
        const { droppedId, droppedXY } = droppedCardData;
        // шлем только непокрытые карты
        const intersectedCards = DroppedHelper.getIntersected(
            droppedXY, DroppedHelper.getUncoveredSimplePairs(droppedCardsState), cardSizes);
        // покрывающая карта
        let coveringCard = CardsHelper.getCardById(userState, droppedId);
        // покрытая карта
        const coveredCard = !coveringCard.num ? intersectedCards.find(card =>
            CardsHelper.isMorePowerSecond(card, coveringCard, trump.suit)) : null;
        const isWillTransferDefend = !coveredCard;
        // проверяем, можно ли положить карту на поле
        const failMoveError = getFailMoveError(coveringCard, intersectedCards, droppedXY, coveredCard);

        if (failMoveError) {
            if (failMoveError === 'failNoCardId') return;
            setInfoCommand(failMoveError);
        } else {
            if (coveringCard.suit) {
                // сходили простой картой
                dropUserMoveCards(
                    isWillTransferDefend ? [coveringCard] : [[coveredCard, coveringCard]],
                    droppedId,
                    droppedXY,
                    isWillTransferDefend
                );
                if (isWillTransferDefend) {
                    // чел перевел картой защиту на комп
                    setNextMoveCommand('transferDefend');
                } else if (DroppedHelper.getUncoveredSimplePairs(droppedCardsState).length === 1) {
                    // если чел покрыл все карты
                    // !!! единственное 2 место, где droppedCards прежнее,
                    // т.к dropUserMoveCards еще не обновил состояние
                    setNextMoveCommand('completePartyOrRepeatAttack');
                }
            } else {
                dropUserMoveCards([coveringCard], droppedId, droppedXY);
                // пусто потому что, либо магические карты легкого поведения требуют
                // дальнейшего хода простыми, либо сами себя обслуживают
            }
        }
    };

    return {
        goUserAttack,
        goUserDefend,
    }
}