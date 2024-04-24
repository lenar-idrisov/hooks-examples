import * as baseUtils from '../../helpers/baseUtils';
import DroppedHelper from "../../helpers/DroppedHelper";
import { getMagicItemByProp } from "../../constants/magicList";
import CardsHelper from "../../helpers/CardsHelper";
import { useSelector } from "react-redux";
import useWithDispatch from "../base/useWithDispatch";
import { playersSlice } from "../../store/reducers/players";
import { droppedCardsSlice } from "../../store/reducers/droppedCards";
import { commandsSlice } from "../../store/reducers/commands";
import { appSlice } from "../../store/reducers/app";
import { sendCardsToExchange } from "../../api/sendDataOnline";
import FinderXYHelper from '../../helpers/FinderXYHelper';
import { onlineDataSlice } from '../../store/reducers/onlineData';


export default function useMagicApplier({ boardSizes, cardSizes }) {
    const settingsState = useSelector(state => state.settings);
    const droppedCardsState = useSelector(state => state.droppedCards);
    const [userState, robotState] = useSelector(state => state.players);
    const { activeId } = useSelector(state => state.party);
    const { friendCardsQty } = useSelector(state => state.onlineData);


    const { setTrumpSuit } = useWithDispatch(appSlice);
    const { setFriendCardsQty } = useWithDispatch(onlineDataSlice);
    const { addDroppedSingleCards, updateDroppedCards } = useWithDispatch(droppedCardsSlice);
    const {
        addPlayerSimpleCards,
        updatePlayerSimpleCards,
        updatePlayerMagicCards,
    } = useWithDispatch(playersSlice);
    const {
        setNextMoveCommand,
        setInfoCommand,
        setPlayerCommand,
    } = useWithDispatch(commandsSlice);


    // магические карты которые просто вносят изменения в карты игроков, без влияния на партию
    function applyMagicCardEffect(ownerId, magicCard, needContinueRobotAttack, needContinueRobotDefend) {
        const magicItem = getMagicItemByProp('num', magicCard.num);
        // TODO: из-за того что этому событию не соответсвует никакой partybutton и он скрывается, 
        // если в самом конце сходить супер-картой - то partyTimer не сработает
        setInfoCommand(magicItem.command + (ownerId !== userState.id ? 'Partner' : ''));
        baseUtils.logBeauty('useMagicApplier()', 2, magicItem.key);

        const isRobotModeOrOwner = (ownerId === activeId) &&
            (settingsState.isGameWithRobot || userState.id === ownerId);

        const updatePlayerCard = (playerId, cards) => {
            updatePlayerSimpleCards({ playerId, data: cards.simpleCards });
            updatePlayerMagicCards({ playerId, data: cards.magicCards });
        }

        switch (magicItem.key) {
            case 'trump_change':
                setTrumpSuit(magicCard.modi);
                break;
            case 'gift_pack': {
                if (settingsState.isGameWithRobot || userState.id === ownerId) {
                    const cardsPack = CardsHelper.getPackWithEqualDigit(magicCard.packDigit);
                    addPlayerSimpleCards({
                        playerId: ownerId,
                        data: cardsPack
                    });
                } else {
                    setFriendCardsQty(friendCardsQty + 4);
                }
                break;
            }
            case 'exchange_card': {
                if (settingsState.isGameWithRobot) {
                    updatePlayerCard(robotState.id, {
                        simpleCards: userState.simpleCards,
                        magicCards: userState.magicCards
                    });
                    updatePlayerCard(userState.id, {
                        simpleCards: robotState.simpleCards,
                        magicCards: robotState.magicCards
                    });
                } else if (userState.id === ownerId) {
                    sendCardsToExchange({
                        simpleCards: userState.simpleCards,
                        magicCards: userState.magicCards
                    }, true);
                }
                break;
            }
            case 'transfer_card':
                if (isRobotModeOrOwner) {
                    setNextMoveCommand('transferDefendMagic');
                }
                break;
            case 'lamp_card':
                // получаем отдельно покрытые пары и магические (они уже с координатами все)
                const coveredPairsWithMagic = DroppedHelper.getCoveredPairsWithMagic(droppedCardsState);
                // получаем непокрытые пары (в паре 1 карта)
                const uncoveredPairs = DroppedHelper.getUncoveredSimplePairs(droppedCardsState);
                // автоматически покрываем эти карты
                const easyCoveredPairs = CardsHelper.getEasyCoveredPairs(uncoveredPairs);
                // добавляем координаты для ново-покрывающих карт
                const easyCoveredPairsWithXY = FinderXYHelper.getPairedCardsWithXY(
                    easyCoveredPairs,
                    droppedCardsState,
                    boardSizes,
                    cardSizes
                );
                // объединяем ранее покрытые и ново-покрытые карты
                updateDroppedCards([...easyCoveredPairsWithXY, ...coveredPairsWithMagic]);
                if (isRobotModeOrOwner) {
                    setNextMoveCommand('completePartyOrRepeatAttack');
                }
                break;
            // карты которые либо завершают партию, либо переводят ход другому игроку
            case 'repeat_card':
                let coveringCards = DroppedHelper.getCoveringSimpleCards(droppedCardsState)
                // оборачиваю в массив, чтобы прирм map использовать можно было
                let finalCards = [coveringCards[coveringCards.length - 1]];
                // корректируем кол-во повторных карт
                // чистим id и координаты
                finalCards = finalCards
                    .map(card => CardsHelper.getGeneratedCard(card.digit, card.suit));

                const finalCardsWithXY = FinderXYHelper.getSingleCardsWithXY(
                    finalCards,
                    droppedCardsState,
                    boardSizes,
                    cardSizes
                );
                addDroppedSingleCards(finalCardsWithXY);
                if (isRobotModeOrOwner) {
                    setNextMoveCommand(userState.id === ownerId ? 'defendEnemy' : 'defendUser');
                }
                break;
            case 'reset_card': {
                const againUncoveredPairs = DroppedHelper.getRepeatUncoveredPairs(droppedCardsState)
                updateDroppedCards(againUncoveredPairs);
                if (isRobotModeOrOwner) {
                    setNextMoveCommand(userState.id === ownerId ? 'defendEnemy' : 'defendUser');
                }
                break;
            }
            default:
                baseUtils.logBeauty('useMagicApplier() unknown', 5);
        }
        // если после применения эффекта магии надо вернуть управление роботу - возвращаем
        if (needContinueRobotAttack) {
            setPlayerCommand('continueAttackEnemy');
        } else if (needContinueRobotDefend) {
            setPlayerCommand('continueDefendEnemy');
        }
    }

    return applyMagicCardEffect;
}