import * as baseUtils from "../../helpers/baseUtils";
import useWithDispatch from "../base/useWithDispatch";
import { useContext, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { partySlice } from "../../store/reducers/party";
import { commandsSlice } from "../../store/reducers/commands";
import { sendCommand } from "../../api/sendDataOnline";
import DroppedHelper from "../../helpers/DroppedHelper";
import { playersSlice } from "../../store/reducers/players";
import { droppedCardsSlice } from "../../store/reducers/droppedCards";
import { onlineDataSlice } from "../../store/reducers/onlineData";
import { AudioPlayerContext } from "../..";


export default function usePartyEnd({ deckWorker }) {
	const audioPlayer = useContext(AudioPlayerContext);
	const isOutCommandRef = useRef(false);
	const partyState = useSelector(state => state.party);
	const { attackId, loserId } = partyState;
	const { trump } = useSelector(state => state.app);
	const { partyEndCommand } = useSelector(state => state.commands);
	const deckState = useSelector(state => state.deck);
	const [userState, robotState] = useSelector(state => state.players);
	const settingsState = useSelector(state => state.settings);
	const droppedCardsState = useSelector(state => state.droppedCards);
	const { friendCardsQty, deckOnlineQty } = useSelector(state => state.onlineData);

	const { setNextMoveCommand, setInfoCommand, setGameToggleCommand } = useWithDispatch(commandsSlice);
	const { setPartyPartialOptions } = useWithDispatch(partySlice);
	const { addPlayerSimpleCards } = useWithDispatch(playersSlice);
	const { clearDroppedCards } = useWithDispatch(droppedCardsSlice);
	const { setFriendCardsQty } = useWithDispatch(onlineDataSlice);

	const finalDeckQty = settingsState.isGameWithRobot ?
		deckState.simpleCards.length : deckOnlineQty;


	useEffect(() => {
		if (!partyEndCommand) return;
		isOutCommandRef.current = partyEndCommand.includes('Out');
		const clearedCommand = partyEndCommand.replace('Again', '').replace('Out', '');
		if (clearedCommand !== 'cardsToTrash') {
			baseUtils.logBeauty("usePartyEnd() unknown", 5, clearedCommand);
			return;
		}
		baseUtils.logBeauty("usePartyEnd()", 2, clearedCommand);
		partyEndResolver();
	}, [partyEndCommand]);


	// проверяем, не наступил ли конец игры
	function isGameEnd() {
		let userCardsQty = userState.simpleCards.length;
		let enemyCardsQty = settingsState.isGameWithRobot ?
			robotState.simpleCards.length : friendCardsQty;
		let pickUppedCardsQty;
		if (loserId) {
			pickUppedCardsQty = DroppedHelper
				.getOnlySimpleResetCards(droppedCardsState).length;
			if (loserId === userState.id) {
				userCardsQty += pickUppedCardsQty;
			} else {
				enemyCardsQty += pickUppedCardsQty;
			}
		}
		let checkResultCommand;
		if (!finalDeckQty && !userCardsQty && !enemyCardsQty) {
			checkResultCommand = 'gameEndDraw';
		} else if (!userCardsQty && !finalDeckQty) {
			checkResultCommand = 'gameEndUserWin';
		} else if (!enemyCardsQty && !finalDeckQty) {
			checkResultCommand = 'gameEndEnemyWin';
		}
		return checkResultCommand;
	}


	function partyEndResolver() {
		// только атакующий игрок проверяет, не наступил ли конец игры
		const gameEndResultCommand = userState.id === partyState.attackId ||
			settingsState.isGameWithRobot ?
			isGameEnd() : null;
		if (gameEndResultCommand) {
			pickUpCardsAndGetQty();
			setGameToggleCommand(gameEndResultCommand);
		} else {
			completeParty();
			if (!settingsState.isGameWithRobot &&
				!isOutCommandRef.current) {
				// сразу шлем команду напарнику, чтобы тоже параллельно выполнялся
				sendCommand({ partyEndCommand: 'cardsToTrash' });
			}
		}
	}


	function completeParty() {
		let pickUppedCardsQty = pickUpCardsAndGetQty();
		// коротко за 2cек уведомим, что напарник нажал "Бито"
		if (userState.id !== attackId) {
			setInfoCommand('partyEnding');
		} else {
			// если сам чел нажал бито - сразу озвучим
			audioPlayer.play('cardsToTrash');
		}
		setPartyPartialOptions({
			loserId: loserId || null,
			trashPrevParty: [...droppedCardsState],
			trialCardsQty: 3,
		});
		// если напарник нажал бито - замораживаем партию на 2 сек 
		// для краткого уведомления текущего игрока о бито
		setPartyPartialOptions({ isPartyFrozen: userState.id !== attackId });

		clearDroppedCards();
		setNextMoveCommand('resolveNextStart');
		deckWorker.autoPushCards(pickUppedCardsQty, trump.suit);
	}

	function pickUpCardsAndGetQty() {
		let pickUppedCards = [];
		if (loserId) {
			pickUppedCards = DroppedHelper.getOnlySimpleResetCards(droppedCardsState);
			if (settingsState.isGameWithRobot || userState.id === loserId) {
				addPlayerSimpleCards({
					playerId: loserId,
					data: pickUppedCards
				});
			} else {
				setFriendCardsQty(friendCardsQty + pickUppedCards.length);
			}
		}
		return pickUppedCards.length;
	}
}