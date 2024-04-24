import { onlineDataSlice } from "../../store/reducers/onlineData";
import useWithDispatch from "../base/useWithDispatch";
import { sendInvitation } from "../../api/sendDataOnline";
import { useSelector } from "react-redux";
import * as baseUtils from "../../helpers/baseUtils";
import { commandsSlice } from "../../store/reducers/commands";
import { settingsSlice } from "../../store/reducers/settings";
import { AdvContext } from "../..";
import { useContext } from "react";


// подготовка колоды (простой и магической) до начала игры
export default function useOnlineSetup(switchWindow, deckWorker) {
    const advManager = useContext(AdvContext);
    const [userState] = useSelector(state => state.players);
    const { playersList } = useSelector((state) => state.onlineData);

    const {
        setSendingInvitationStatus,
        setFriendData,
        setFriendChangedStatus
    } = useWithDispatch(onlineDataSlice);
    const { setGameToggleCommand } = useWithDispatch(commandsSlice);
    const { setPartialSettings } = useWithDispatch(settingsSlice);


    const copyLinkForFriend = async () => {
        const pageUrl = (window.location !== window.parent.location) ?
            document.referrer : document.location.href;
        const paramSymbol = pageUrl.includes('?') ? '&' : '?';
        const url = new URL(pageUrl + `${paramSymbol}link-sender=` + userState.id);
        await advManager.copy(url);
        switchWindow('push', 'friendChanged', true, true);
        setFriendChangedStatus('friendWillAutoConnect');
    }

    const invitePlayer = (friend) => {
        const selectedFriend = friend || baseUtils.randFromArrayObject(playersList);
        setFriendData(selectedFriend);
        setSendingInvitationStatus('isWaiting');
        switchWindow('push', 'sendingInvitation', true);
        sendInvitation(selectedFriend.id);
    }

    const startGameWithRobot = () => {
        setPartialSettings({ isGameWithRobot: true });
        window.isOfflineGame = true;
        switchWindow('setup', 'onlineSetup', false, false);
        deckWorker.prepareInitialDeck();
        setGameToggleCommand('startGame');
    }

    return {
        invitePlayer,
        copyLinkForFriend,
        startGameWithRobot
    };
}