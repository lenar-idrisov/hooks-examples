import { AdvContext, AudioPlayerContext } from "../../index";
import * as baseUtils from "../../helpers/baseUtils";
import { useContext, useEffect, useRef, useState } from "react";
import useWithDispatch from "../base/useWithDispatch";
import { useSelector } from "react-redux";
import { partySlice } from "../../store/reducers/party";
import { playersSlice } from "../../store/reducers/players";
import { commandsSlice } from "../../store/reducers/commands";
import { appSlice } from "../../store/reducers/app";
import { droppedCardsSlice } from "../../store/reducers/droppedCards";
import { sendCommand, sendInterruptGame } from "../../api/sendDataOnline";
import { nanoid } from "nanoid";
import { gameBackgroundGradients, pushColors } from "../../constants/colors";
import { onlineDataSlice } from "../../store/reducers/onlineData";
import useTimeout from "../base/useTimeout";
import socket from "../../api/socket";
import { baseData } from "../../constants/base";


export default function useGameToggle({
    deckWorker,
    switchWindow,
}) {
    const advManager = useContext(AdvContext);
    const audioPlayer = useContext(AudioPlayerContext);
    const { gameToggleCommand } = useSelector(state => state.commands);
    const { trump } = useSelector(state => state.app);
    const { loserId } = useSelector(state => state.party);
    const settingsState = useSelector(state => state.settings);
    const [userState, _] = useSelector(state => state.players);
    const { isFriendStartGame } = useSelector(state => state.onlineData);
    // команда пришла по сети
    const isOutCommandRef = useRef(false);

    const { clearDroppedCards } = useWithDispatch(droppedCardsSlice);
    const { clearPlayersCards } = useWithDispatch(playersSlice);
    const { setFriendStartGame, setFriendChangedStatus, clearOnlineFriend } = useWithDispatch(onlineDataSlice);
    const { resetParty } = useWithDispatch(partySlice);
    const {
        setTrumpSuit,
        setGameSizes,
        setGameColor,
        setPushColor,
        setGameFrozen
    } = useWithDispatch(appSlice);
    const {
        setNextMoveCommand,
        setInfoCommand,
    } = useWithDispatch(commandsSlice);
    const [isRestartDef, setRestartDef] = useState(false);
    const isHintWasShown = useRef(false);


    // перезапуск игры по таймеру
    useTimeout(
        () => restartGame(),
        baseData.restartTime,
        isRestartDef,
        true
    );

    useEffect(() => {
        if (!gameToggleCommand) return;
        isOutCommandRef.current = gameToggleCommand.includes('Out');
        const clearedCommand = gameToggleCommand.replace('Again', '').replace('Out', '')
        baseUtils.logBeauty('useGameToggle()', 2, clearedCommand);
        gameToggleResolver(clearedCommand);
    }, [gameToggleCommand]);


    function restoreGame() {
        setGameColor(baseUtils.randFromArrayObject(gameBackgroundGradients));
        setPushColor(baseUtils.randFromArrayObject(pushColors));
        clearDroppedCards();
        clearPlayersCards();
        resetParty();
    }

    function frozenAndRestore() {
        setGameFrozen(true);
        restoreGame();
    }

    function startGame() {
        if (settingsState.isGameWithRobot) {
            const newTrumpSuit = baseUtils.randAB(1, 4, [trump.suit]);
            setTrumpSuit(newTrumpSuit);
            deckWorker.autoPushCards(0, newTrumpSuit);
        } else {
            // козырь уже пришел от сервера, поэтому не ставим новый
            deckWorker.autoPushCards(0, trump.suit);
        }
        setGameSizes(nanoid());
        setGameFrozen(false);
        setNextMoveCommand('resolveNextStart');
        if (isHintWasShown.current || Number(baseUtils.localStateWorker('read', 'isWReady')) >= 2) {
            // при первом запуске игры показываем приветсвенное окно, а не рекламу
            advManager.showFullscreenAdv(audioPlayer);
        }
        if (!isHintWasShown.current && Number(baseUtils.localStateWorker('read', 'isWReady')) < 6) {
            switchWindow('welcome', null, true, true);
            isHintWasShown.current = true;
        }
    }

    function restartGame() {
        if (!settingsState.isGameWithRobot) {
            setFriendStartGame(loserId ? userState.id !== loserId : !isFriendStartGame);
        }
        switchWindow('ending', null, false, false);
        startGame();
    }

    const completeGame = (newCommand) => {
        if (!settingsState.isGameWithRobot &&
            !isOutCommandRef.current) {
            sendCommand({ gameToggleCommand: newCommand });
        }
        if (settingsState.isGameWithRobot) {
            deckWorker.prepareInitialDeck();
        }
        frozenAndRestore();
        setInfoCommand('gameEnding');
        switchWindow('ending', null, false, true);
        audioPlayer.play('ending');
        setRestartDef(nanoid());
    }

    function changeFriend() {
        frozenAndRestore();
        clearOnlineFriend();
        setRestartDef(false);
        switchWindow('setup', 'onlineSetup', false, true);
        sendInterruptGame();
    }

    // компанда приходит по сети
    // игрок покинул игру либо решил сменил напарника
    function interruptGame() {
        setRestartDef(false);
        setGameFrozen(true);
        switchWindow('push', 'friendChanged', false, true);
        setFriendChangedStatus('isLeave');
    }

    // фатальная ошибка в игре, прерываем игру
    function breakGameDueToError() {
        frozenAndRestore();
        switchWindow('notice', 'fatalError', false, true);
        if (!settingsState.isGameWithRobot) {
            socket.disconnect();
        }
    }

    function gameToggleResolver(newCommand) {
        switch (newCommand) {
            case 'breakGameDueToError':
                breakGameDueToError();
                break;
            case 'startGame':
                startGame();
                break;
            case 'restartGame':
                restartGame();
                break;
            case 'interruptGame':
                interruptGame();
                break;
            case 'changeFriend':
                changeFriend();
                break;
            case 'clearGameAfterRobot':
                frozenAndRestore();
                break;
            case 'gameEndDraw':
            case 'gameEndEnemyWin':
            case 'gameEndUserWin':
                completeGame(newCommand);
                break;
            default:
                baseUtils.logBeauty('useGameToggle() unknown', 5, newCommand);
        }
    }
}