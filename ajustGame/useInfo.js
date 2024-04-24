// @ts-nocheck
import { useContext, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import useWithDispatch from "../base/useWithDispatch";
import { getCommandResult } from "../../helpers/infoHelper";
import Bubi from "../../assets/image/suit/1.png";
import Heart from "../../assets/image/suit/2.png";
import Trefy from "../../assets/image/suit/3.png";
import Piki from "../../assets/image/suit/4.png";
import * as baseUtils from "../../helpers/baseUtils";
import { commandsSlice } from "../../store/reducers/commands";
import { appSlice } from "../../store/reducers/app";
import { partySlice } from "../../store/reducers/party";
import useTimer from "../base/useTimer";
import { baseData } from "../../constants/base";
import { failCommands, magicCommands } from "../../constants/commands";
import { AudioPlayerContext } from "../..";


export default function useInfo(partyButtonHandler) {
	const audioPlayer = useContext(AudioPlayerContext);
    const { trump, isTabloTimerDef, isGameFrozen } = useSelector(state => state.app);
    const { infoCommand } = useSelector(state => state.commands);
    const { activeId, isPartyFrozen } = useSelector(state => state.party);
    const [userState, _] = useSelector(state => state.players);
    // если ошибочное сообщение перетерлось другим,
    // предыдущее нормальное сообщение уже не возвращаем
    const prevCommandForRestore = useRef(null);
    const timerIdForRestore = useRef(null);
    const isWasMagicApplied = useRef(null);

    const { setInfoCommand, } = useWithDispatch(commandsSlice);
    const { setPartyPartialOptions } = useWithDispatch(partySlice);
    const { setTrumpImage } = useWithDispatch(appSlice);

    const [messageStatus, setMessageStatus] = useState(null);
    // текстовая подсказка игроку, что происходит в игре
    const [message, setMessage] = useState(null);
    const tabloTime = useTimer(
        isPartyFrozen ? baseData.frozenTime :
            (userState.id === activeId ? baseData.timeToWaitMove : baseData.timeToWaitEnemy),
        isTabloTimerDef,
        true
    );

    useEffect(_ => {
        if (message) return;
        setMessage('Подготовка...');
    }, [])

    useEffect(_ => {
        if (!infoCommand) return;
        const isPartnerMove = infoCommand.includes('Partner');
        const clearedCommand = infoCommand.replace('Again', '').replace('Out', '').replace('Partner', '');
        baseUtils.logBeauty('useInfo()', 2, clearedCommand);
        infoResolver(clearedCommand, isPartnerMove);
    }, [infoCommand]);

    // в игре сменился козырь - меняем и визуально тоже
    useEffect(_ => {
        if (trump.suit) {
            const suitImages = {
                1: Bubi,
                2: Heart,
                3: Trefy,
                4: Piki,
            }
            setTrumpImage(suitImages[trump.suit]);
        }
    }, [trump.suit]);


    useEffect(() => {
        document.addEventListener('keyup', onPressEnterButton);
        return () => document.removeEventListener('keyup', onPressEnterButton);
    })


    useEffect(_ => {
        // если партию разморозили, возвращаем сохраненное инфо-сообщение
        if (!isPartyFrozen && !isGameFrozen && prevCommandForRestore.current) {
            restoreMessage();
        }
    }, [isPartyFrozen]);



    function infoResolver(newCommand, isPartnerMove) {
        const isFailCommand = failCommands.includes(newCommand);
        const isMagicCommand = magicCommands.includes(newCommand);

        if (!isFailCommand && !isMagicCommand && newCommand !== 'partyEnding' &&
            (isPartyFrozen || isWasMagicApplied.current)) {
            // если сообщения заморожены, просто сохраняем, чтобы потом восстановить
            prevCommandForRestore.current = newCommand;
        } else {
            // если команда затерлась новой, предыдущее сообщение не возвращаем
            clearTimeout(timerIdForRestore.current);
            isWasMagicApplied.current = false;
            const commandResult = getCommandResult(newCommand, isPartnerMove);
            setMessage(commandResult.message);
            if (isFailCommand) {
                setMessageStatus('fail');
                audioPlayer.play('warningFail');
                // после предупреждения об ошибке, возвращаем предыдущее сообщение
                planRestoreMessage(false);
            } else if (isMagicCommand) {
                setMessageStatus('magic');
                isWasMagicApplied.current = true;
                setPartyPartialOptions({ partyButton: commandResult.partyButton });
                planRestoreMessage(true);
            } else {
                if (isPartyFrozen) {
                    setMessageStatus('frozen');
                } else {
                    setMessageStatus(null);
                }
                prevCommandForRestore.current = newCommand;
                setPartyPartialOptions({ partyButton: commandResult.partyButton });
            }
        }
    }

    function planRestoreMessage(isMagic) {
        // возвращаем предыдущее сообщение
        timerIdForRestore.current = setTimeout(_ => {
            restoreMessage();
        }, isMagic ? baseData.frozenTimeLong : baseData.frozenTime);
    }

    function restoreMessage() {
        clearTimeout(timerIdForRestore.current);
        isWasMagicApplied.current = false;
        setMessageStatus(null);
        setInfoCommand(prevCommandForRestore.current);
    }

    // по нажатию Enter/пробела запускаем видимую в данный момент кнопку
    function onPressEnterButton(event) {
        if (['Enter', 'Space'].includes(event.code)) {
            partyButtonHandler();
        }
    }

    return {
        message,
        messageStatus,
        tabloTime,
    }
}