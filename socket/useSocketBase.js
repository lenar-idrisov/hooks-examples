import useWithDispatch from "../base/useWithDispatch";
import { useContext, useEffect, useRef } from "react";
import { playersSlice } from "../../store/reducers/players";
import { AdvContext } from "../..";
import { useSelector } from "react-redux";
import { onlineDataSlice } from "../../store/reducers/onlineData";
import { logBeauty } from "../../helpers/baseUtils";
import { sendGameInit } from "../../api/sendDataOnline";
import socket from "../../api/socket";
import { getLinkSenderId, isObjectKeysInRange } from "../../helpers/mainUtils";
import { settingsSlice } from "../../store/reducers/settings";
import { commandsSlice } from "../../store/reducers/commands";
import { sendingSettings } from "../../constants/base";


export default function useSocketBase() {
	const advManager = useContext(AdvContext);
	const commandsState = useSelector(state => state.commands);
	const [userState] = useSelector(state => state.players);
	const windowsState = useSelector(state => state.windows);
	const onlineDataState = useSelector(state => state.onlineData);
	const { friendData } = onlineDataState;
	const { setLinkSenderId } = useWithDispatch(onlineDataSlice);
	const { setPartialSettings } = useWithDispatch(settingsSlice);
	const { setGameToggleCommand } = useWithDispatch(commandsSlice);
	const isConnected = useRef(false);
	let { setPlayerAvatar, setPlayerName, setPlayerId } = useWithDispatch(playersSlice);


	useEffect(_ => {
		if (isConnected.current) return;
		const linkSenderId = getLinkSenderId();
		const initData = {
			linkSenderId,
			id: advManager.id,
			lang: window.lang
		}
		sendGameInit(initData, (playerInfo) => {
			const { id, name, avatarIndex, settings } = playerInfo;
			if (!id || !name || !Number.isInteger(avatarIndex)) {
				logBeauty('sendGameInit() !id || !name || !avatarIndex', 2, playerInfo);
				socket.disconnect();
			} else {
				isConnected.current = true;
			}
			setPlayerAvatar({ playerId: userState.id, avatarIndex });
			setPlayerName({ playerId: userState.id, data: name });
			setPlayerId({ playerId: userState.id, data: id });
			if (linkSenderId) {
				setLinkSenderId(linkSenderId);
			}
			if (settings && isObjectKeysInRange(settings, sendingSettings)) {
				setPartialSettings({
					...settings,
					isSetComplete: true
				});
			}
		});
	}, [socket]);


	useEffect(() => {
		socket.on("GAME:interrupt", onGameInterrupt);
		socket.on("ERROR", onError);

		function onError(info) {
			setGameToggleCommand('breakGameDueToError');
			logBeauty('onError() fatalError', 5, info.message);
		}

		function onGameInterrupt(friendId) {
			if (!friendData.id || friendData.id !== friendId) return;
			// напарник покинул игру, игру замораживаем, останавливаем таймеры
			setGameToggleCommand('interruptGame');
		}

		return () => {
			socket.off("GAME:interrupt", onGameInterrupt);
			socket.off('ERROR', onError);
		}
	}, [
		socket,
		windowsState,
		onlineDataState,
		commandsState
	]);
}