import { useContext, useEffect, useState } from "react";
import { onlineDataSlice } from "../../store/reducers/onlineData";
import { appSlice } from "../../store/reducers/app";
import { useSelector } from "react-redux";
import { baseData } from "../../constants/base";
import { commandsSlice } from "../../store/reducers/commands";
import { AudioPlayerContext } from "../..";
import useWithDispatch from "../base/useWithDispatch";
import useTimeout from "../base/useTimeout";
import DroppedHelper from "../../helpers/DroppedHelper";
import { nanoid } from "nanoid";
import { partySlice } from "../../store/reducers/party";


export default function usePartyTimer({ switchWindow }) {
	const audioPlayer = useContext(AudioPlayerContext);
	const { activeId, partyButton, isPartyFrozen } = useSelector(state => state.party);
	const droppedCardsState = useSelector(state => state.droppedCards);
	const { isGameFrozen } = useSelector(state => state.app);
	const [userState, _] = useSelector(state => state.players);
	const settingsState = useSelector(state => state.settings);
	const { nextMoveCommand } = useSelector(state => state.commands);
	const { friendChangedStatus } = useSelector(state => state.onlineData);
	const { setNextMoveCommand, setPartyEndCommand } = useWithDispatch(commandsSlice);

	const { setFriendChangedStatus } = useWithDispatch(onlineDataSlice);
	const { setTabloTimerDef } = useWithDispatch(appSlice);
	const { setPartyPartialOptions } = useWithDispatch(partySlice);

	const [isNotRespondDef, setNotRespondDef] = useState(false);
	const [isUnfrozenDef, setUnfrozenDef] = useState(false);


	const isExistAnySimpleCardsOnDesk = DroppedHelper.isExistAnySimpleOnBoard(droppedCardsState);


	const startPartyDeferred = () => {
		if (isPartyFrozen || isGameFrozen) return;
		audioPlayer.stop('timer');
		switchWindow('push', 'friendChanged', true, false);
		setNotRespondDef(nanoid());
		setTabloTimerDef(nanoid());
	}

	// при смене игрока - запускает таймер времени для его хода,
	// при бито разморозкой занимается уже другой useEffect
	useEffect(_ => {
		if (!nextMoveCommand || settingsState.isGameWithRobot) return;
		startPartyDeferred();
	}, [nextMoveCommand]);


	// запускает доп время для таймера
	useEffect(_ => {
		if (!nextMoveCommand || settingsState.isGameWithRobot) return;
		if (friendChangedStatus === 'isWaitingMore') {
			startPartyDeferred();
		}
	}, [friendChangedStatus]);


	// размораживает партию/запуск таймера после разморозки
	useEffect(_ => {
		if (!nextMoveCommand || isGameFrozen) return;
		if (isPartyFrozen) {
			// замораживаем партию
			audioPlayer.stop('timer');
			setNotRespondDef(false);
			setTabloTimerDef(nanoid());
			setUnfrozenDef(nanoid());
		} else {
			// размораживаем партию
			audioPlayer.play('cardsToTrash');
			if (!settingsState.isGameWithRobot) {
				// запускаем таймер
				startPartyDeferred();
			}
		}
	}, [isPartyFrozen]);


	// размораживаем партию
	useTimeout(
		() => setPartyPartialOptions({ isPartyFrozen: false }),
		baseData.frozenTime,
		isUnfrozenDef
	)

	// по истечении времени либо автоматически бито/беру либо уведомляшка, что время истекает
	useTimeout(
		() => {
			if (partyButton) {
				if (partyButton === 'cardsToTrash') setPartyEndCommand(partyButton);
				if (partyButton === 'cannotCoverCards') setNextMoveCommand(partyButton);
			} else if (!isExistAnySimpleCardsOnDesk) {
				switchWindow('push', 'friendChanged', true, true);
				setFriendChangedStatus('isNotRespond');
				audioPlayer.stop('timer');
			}
		},
		userState.id === activeId ? baseData.timeToWaitMove : baseData.timeToWaitEnemy,
		isNotRespondDef,
	)
}