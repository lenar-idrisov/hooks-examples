import * as baseUtils from "../../helpers/baseUtils";
import useWithDispatch from "../base/useWithDispatch";
import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { partySlice } from "../../store/reducers/party";
import { sendCommand } from "../../api/sendDataOnline";
import { commandsSlice } from "../../store/reducers/commands";
import { commandsToLaunchRobotMove, nextMoveCommands } from "../../constants/commands";


export default function useNextMove() {
	const isOutCommandRef = useRef(false);
	const partyState = useSelector(state => state.party);
	const { activeId, attackId, loserId } = partyState;
	const { nextMoveCommand } = useSelector(state => state.commands);
	const [userState, robotState] = useSelector(state => state.players);
	const settingsState = useSelector(state => state.settings);
	const { isFriendStartGame } = useSelector(state => state.onlineData);

	const { setInfoCommand, setPlayerCommand } = useWithDispatch(commandsSlice)
	const { setPartyPartialOptions } = useWithDispatch(partySlice);
	const allPlayerIds = [
		userState.id,
		robotState.id
	];
	const getOtherId = (id) =>
		id === allPlayerIds[0] ? allPlayerIds[1] : allPlayerIds[0];

	useEffect(() => {
		if (!nextMoveCommand) return;
		isOutCommandRef.current = nextMoveCommand.includes('Out');
		const clearedCommand = nextMoveCommand.replace('Again', '').replace('Out', '');
		if (!nextMoveCommands.includes(clearedCommand)) {
			baseUtils.logBeauty("useNextMove() unknown", 5, clearedCommand);
			return;
		}
		nextPlayerResolver(clearedCommand);
	}, [nextMoveCommand]);


	// отвечает только за передачу хода другому игроку
	function nextPlayerResolver(newCommand) {
		let finalCommand = newCommand;
		let isCardsTransfered;
		let newLoserId;
		let firstActivePlayerId;

		if (!settingsState.isGameWithRobot &&
			!isOutCommandRef.current &&
			newCommand !== 'resolveNextStart') {
			// сразу шлем командунапарнику, чтобы тоже параллельно выполнялся
			sendCommand({ nextMoveCommand: newCommand });
		}

		// решаем, кто начинает партию
		if (newCommand === 'resolveNextStart') {
			if (!activeId) {
				firstActivePlayerId = settingsState.isGameWithRobot ?
					baseUtils.randFromArrayObject(allPlayerIds) :
					(isFriendStartGame ? robotState.id : userState.id);
			} else {
				firstActivePlayerId = getOtherId(loserId || activeId);
			}
			finalCommand = firstActivePlayerId === userState.id ?
				"attackUser" : "attackEnemy";
		}
		// перевели ход обычной картой
		if (newCommand === 'transferDefend') {
			finalCommand = userState.id === attackId ?
				"defendUserAfterTransfer" : "defendEnemyAfterTransfer";
			// ждем пока напарник отобьется... : напарник перевел карты, ты отбиваешься...
			// меняем атакующего и отбивающегося игрока местами, поэтому шлем флаг
			isCardsTransfered = true;
		}
		// перевели ход (сменили атакующего) супер-картой
		if (newCommand === 'transferDefendMagic') {
			finalCommand = userState.id === attackId ?
				"defendUserAfterTransferMagic" : "defendEnemyAfterTransfer";
			// ждем пока напарник отобьется... : напарник перевел карты, ты отбиваешься...
			// меняем атакующего и отбивающегося игрока местами, поэтому шлем флаг
			isCardsTransfered = true;
		}
		// игрок берет карты
		if (newCommand === 'cannotCoverCards') {
			finalCommand = userState.id === attackId ?
				"attackUserAfterFailCover" : "attackEnemyAfterFailCover";
			// напарник ищет карты, чтобы подкинуть... : напарник берет карты, будешь еще подкидывать?
			newLoserId = userState.id === attackId ? robotState.id : userState.id;
		}
		// игрок отбился и ждет еще карты для покрытия, либо подтверждения завершения партии
		if (newCommand === 'completePartyOrRepeatAttack') {
			finalCommand = userState.id === attackId ?
				"attackUserAfterSuccesCover" : "attackEnemyAfterSuccesCover";
			// ждем, будет ли напарник ходить еще... : есть еще, чем сходить?
		}

		setInfoCommand(finalCommand);
		switchActivePlayer(firstActivePlayerId, isCardsTransfered, newLoserId);
		if (settingsState.isGameWithRobot &&
			commandsToLaunchRobotMove.includes(finalCommand)) {
			setPlayerCommand(finalCommand);
		}
		baseUtils.logBeauty("useNextMove()", 3, newCommand + " -> " + finalCommand);
	}

	// сменить ходящего игрока
	function switchActivePlayer(firstPlayerId, isCardsTransfered, newLoserId) {
		let { attackId, activeId, loserId } = partyState;
		// новая партия
		if (firstPlayerId) {
			activeId = attackId = firstPlayerId;
			loserId = null;
		} else if (isCardsTransfered) {
			// первели защиту
			attackId = getOtherId(attackId);
			activeId = getOtherId(activeId);
		} else {
			// партия еще не окончена, просто меняем активного игрока
			activeId = getOtherId(activeId);
		}
		setPartyPartialOptions({
			attackId,
			activeId,
			loserId: newLoserId || loserId
		});
	}
}