/* eslint-disable react-hooks/exhaustive-deps */
import useWithDispatch from "../base/useWithDispatch";
import { useContext, useEffect, useState } from "react";
import socket from "../../api/socket";
import { AudioPlayerContext } from "../../index";
import { droppedCardsSlice } from "../../store/reducers/droppedCards";
import { commandsSlice } from "../../store/reducers/commands";
import { playersSlice } from "../../store/reducers/players";
import { useSelector } from "react-redux";
import { sendCardsToExchange } from "../../api/sendDataOnline";
import DroppedHelper from "../../helpers/DroppedHelper";
import { onlineDataSlice } from "../../store/reducers/onlineData";
import FinderXYHelper from "../../helpers/FinderXYHelper";


export default function useSocketPlay({
	applyMagicCardEffect,
	boardSizes,
	cardSizes,
	switchWindow,
}) {
	const audioPlayer = useContext(AudioPlayerContext);
	const [userState] = useSelector(state => state.players);
	const partyState = useSelector(state => state.party);
	const settingsState = useSelector(state => state.settings);
	const appState = useSelector(state => state.app);
	const onlineDataState = useSelector(state => state.onlineData);
	const droppedCardsState = useSelector(state => state.droppedCards);
	const commandsState = useSelector(state => state.commands);
	const windowsState = useSelector((state) => state.windows);

	const [magicCardForApply, setMagicCardForApply] = useState(null);

	const { setFriendCardsQty, setDeckQty, setFriendEmoji } = useWithDispatch(onlineDataSlice);
	const { updatePlayerSimpleCards, updatePlayerMagicCards } = useWithDispatch(playersSlice);
	const { addDroppedPairedCards, addDroppedSingleCards } = useWithDispatch(droppedCardsSlice);
	const {
		setNextMoveCommand,
		setPartyEndCommand,
		setGameToggleCommand,
	} = useWithDispatch(commandsSlice);


	useEffect(() => {
		if (!magicCardForApply) return;
		applyMagicCardEffect(onlineDataState.friendData.id, magicCardForApply);
	}, [magicCardForApply])


	useEffect(() => {
		socket.on("UPDATE:deckQty", onDeckQty);
		socket.on("UPDATE:friendCardsQty", onFriendCardsQty);

		socket.on("NEW:playerCommand", onPlayerCommand);
		socket.on("NEW:cardsToExchange", onCardsToExchange);
		socket.on("NEW:emoji", onEmoji);
		socket.on("NEW:droppedCards", onDroppedCard);

		function onDeckQty(qty) {
			setDeckQty(qty);
		}

		function onFriendCardsQty(qty) {
			if (Number.isInteger(qty)) {
				setFriendCardsQty(qty);
			}
		}

		function onPlayerCommand(commandObj) {
			// метка, что команда пришла по сети, а не отправлена локаль
			let finalCommad = Object.values(commandObj)[0] + 'Out';
			if (finalCommad.includes('Enemy')) {
				finalCommad = finalCommad.replace('Enemy', 'User');
			} else {
				finalCommad = finalCommad.replace('User', 'Enemy');
			}
			if (commandObj.nextMoveCommand) {
				setNextMoveCommand(finalCommad);
			}
			if (commandObj.gameToggleCommand) {
				setGameToggleCommand(finalCommad);
			}
			if (commandObj.partyEndCommand) {
				setPartyEndCommand(finalCommad);
			}
		}

		function onCardsToExchange(cards, isFirstSending) {
			setFriendCardsQty(userState.simpleCards.length);
			updatePlayerSimpleCards({ playerId: userState.id, data: cards.simpleCards });
			updatePlayerMagicCards({ playerId: userState.id, data: cards.magicCards });
			if (isFirstSending) {
				sendCardsToExchange({
					simpleCards: userState.simpleCards,
					magicCards: userState.magicCards
				});
			}
		}

		function onDroppedCard(droppedObj) {
			// cards = [{}] / [[{},{}]]
			const { cards, isMagic, isPair } = droppedObj;
			let cardsResult;
			if (!isPair) {
				const isNoPlaceToDrop = DroppedHelper.isNoPlaceToDrop(cards[0], droppedCardsState, boardSizes, cardSizes);
				if (isNoPlaceToDrop) {
					// если по исходным координатам карту напарника 
					// положить на доску не сможем - генерируем новые координаты
					cardsResult = FinderXYHelper.getSingleCardsWithXY(
						cards,
						droppedCardsState,
						boardSizes,
						cardSizes
					);
				} else {
					// если это место свободно, то кладем по исходным координатам
					cardsResult = cards;
				}
				addDroppedSingleCards(cardsResult);
			} else {
				// для покрытой карты мы ранее уже коррдинаты свободыне нашли, возьмем их
				const [coveredCard, coveringCard] = cards[0];
				const coveredCardWithOldXY = droppedCardsState.find(pair => !pair[1] &&
					pair[0].suit === coveredCard.suit && pair[0].digit === coveredCard.digit)[0];
				const newPair = [[coveredCardWithOldXY, coveringCard]];
				// для покрывающей карты найдем свежие координаты со смещением
				const resultPair = FinderXYHelper.getPairedCardsWithXY(
					newPair,
					droppedCardsState,
					boardSizes,
					cardSizes
				);
				addDroppedPairedCards(resultPair);
			}
			if (isMagic) {
				setMagicCardForApply(cards[0]);
			}
			audioPlayer.playSoundAfterDrop(isMagic, isPair);
		}

		function onEmoji(emojiIndex) {
			if (appState.isGameFrozen || partyState.isPartyFrozen) return;
			audioPlayer.play('inviteFriend');
			setFriendEmoji(emojiIndex);
			switchWindow('emojiBox', null, true, true);
		}

		return () => {
			socket.off("UPDATE:deckQty", onDeckQty);
			socket.off("UPDATE:friendCardsQty", onFriendCardsQty);

			socket.off("NEW:playerCommand", onPlayerCommand);
			socket.off("NEW:cardsToExchange", onCardsToExchange);
			socket.off("NEW:emoji", onEmoji);
			socket.off("NEW:droppedCards", onDroppedCard);
		}
	}, [
		socket,
		userState,
		partyState,
		droppedCardsState,
		settingsState,
		appState,
		commandsState,
		windowsState,
		onlineDataState
	]);
}