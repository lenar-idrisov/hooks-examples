import useWithDispatch from "../base/useWithDispatch";
import { useSelector } from "react-redux";
import { useContext, useEffect } from "react";
import socket from "../../api/socket";

import { onlineDataSlice } from "../../store/reducers/onlineData";
import { appSlice } from "../../store/reducers/app";
import { sendResolvedInvitation } from "../../api/sendDataOnline";
import { settingsSlice } from "../../store/reducers/settings";
import { commandsSlice } from "../../store/reducers/commands";
import { logBeauty } from "../../helpers/baseUtils";
import { isObjectKeysInRange } from "../../helpers/mainUtils";
import { playersSlice } from "../../store/reducers/players";
import { AudioPlayerContext } from "../..";


export default function useSocketInvitations({ switchWindow }) {
	const audioPlayer = useContext(AudioPlayerContext);
	const { friendData } = useSelector(state => state.onlineData);
	const windowsState = useSelector(state => state.windows);
	const onlineDataState = useSelector(state => state.onlineData);
	const commandsState = useSelector(state => state.commands);
	const [_, robotState] = useSelector(state => state.players);

	let { setPlayersList, setFriendStartGame } = useWithDispatch(onlineDataSlice);
	const { setPartialSettings } = useWithDispatch(settingsSlice);
	const { setTrumpSuit } = useWithDispatch(appSlice);
	const { setGameToggleCommand } = useWithDispatch(commandsSlice);
	const { setPlayerId } = useWithDispatch(playersSlice);
	let {
		setFriendData,
		setSendingInvitationStatus,
	} = useWithDispatch(onlineDataSlice);


	// обработка приглашений
	useEffect(() => {
		socket.on("INVITE:playersList", onPlayersList);
		socket.on("INVITE:newInvitation", onNewInvitation);
		socket.on("INVITE:resolvedInvitation", onResolvedInvitation);


		function onPlayersList(newPlayersList) {
			if (!Array.isArray(newPlayersList)) return;
			setPlayersList(newPlayersList);
		}

		function onNewInvitation(senderData) {
			if (!senderData.id || !senderData.name || !senderData.settings ||
				!isObjectKeysInRange(senderData, ['id', 'name', 'settings', 'avatarIndex', 'avatarUrl'])) {
				return;
			}
			if (!friendData.name) {
				audioPlayer.play('inviteFriend');
				setFriendData(senderData);
				switchWindow('push', 'newInvitation', true, true);
			} else if (friendData.name !== senderData.name) {
				sendResolvedInvitation('isBusy', senderData.id, true);
			} else {
				// если игроки друг друга пригласили и дублирующее приглашение
				// ниче не делаем, сервер сам обработает
			}
		}

		function onResolvedInvitation(invitationData, dataToStartGame) {
			if (!['isSuccess', 'isReject', 'isLeave', 'isBusy', 'isDidNotWait'].includes(invitationData.status) ||
				(invitationData.status !== 'isDidNotWait' && !isObjectKeysInRange(invitationData, ['status', 'friendData']))) {

				logBeauty('onResolvedInvitation() incorrect status', 5, invitationData);
				setGameToggleCommand('breakGameDueToError');
				return;
			}
			// точка старта игры в онлайн-версии  
			if (invitationData.status === 'isDidNotWait') {
				if (invitationData.friendData.id !== friendData.id) {
					// пригласивший игрок не дождался, но текущий игрок уже играет с другим
					return;
				} else {
					setSendingInvitationStatus(invitationData.status);
					switchWindow('push', 'sendingInvitation', true, true);
				}
			} else if (invitationData.status === 'isSuccess') {
				if (dataToStartGame && isObjectKeysInRange(dataToStartGame, ['trumpSuit', 'settings', 'isFriendStartGame'])) {
					setSendingInvitationStatus(invitationData.status);
					setFriendData(invitationData.friendData);
					setPlayerId({ playerId: robotState.id, data: invitationData.friendData.id });

					setTrumpSuit(dataToStartGame.trumpSuit);
					setPartialSettings(dataToStartGame.settings);
					setFriendStartGame(dataToStartGame.isFriendStartGame);

					switchWindow('push', 'sendingInvitation', null, false);
					setGameToggleCommand('startGame');
				} else {
					logBeauty('onResolvedInvitation() не пришел dataToStartGame', 5);
					setGameToggleCommand('breakGameDueToError');
				}
			} else if (['isReject', 'isLeave', 'isBusy'].includes(invitationData.status)) {
				setSendingInvitationStatus(invitationData.status);
				switchWindow('push', 'sendingInvitation', true, true);
				// пока ниче не делаем, после нажатия "Dыбрать другого" удалим покинувшего игру напарника
			}
		}

		return () => {
			socket.off('INVITE:playersList', onPlayersList);
			socket.off('INVITE:newInvitation', onNewInvitation);
			socket.off('INVITE:resolvedInvitation', onResolvedInvitation);
		}
	}, [
		socket,
		windowsState,
		onlineDataState,
		commandsState
	]);
}