import useWithDispatch from "../base/useWithDispatch";
import { windowsSlice } from "../../store/reducers/windows";
import { AudioPlayerContext } from "../../index";
import { useSelector } from "react-redux";
import { useContext } from "react";


// управляет открытыми модальными окнами
export default function useWindows() {
	const audioPlayer = useContext(AudioPlayerContext);
	const windowsState = useSelector((state) => state.windows);

	const { switchWindowSaveOther, switchWindowCloseOther } = useWithDispatch(windowsSlice);
	// isForceOption: если true/false, то открываем/закрываем принудительно
	const switchWindow = (windowName, childWindowName, isSaveOthers, isForceOption) => {
		const isWindowWasOpened = childWindowName ?
			windowsState[windowName] === childWindowName : windowsState[windowName];
		let newWindow;
		if ([true, false].includes(isForceOption)) {
			// принудительное открытие/закрытие окна
			newWindow = {
				[windowName]: isForceOption ? (childWindowName || true) : false
			}
		} else {
			newWindow = {
				[windowName]: !isWindowWasOpened  ? (childWindowName || true) : false
			}
		};
		isSaveOthers ? switchWindowSaveOther(newWindow) : switchWindowCloseOther(newWindow);
		if (windowName === "navigator" && !isWindowWasOpened) {
			// для навигатора при открытии/закрытии проигрываем звук
			audioPlayer.play("navigator");
		}
	};
	return switchWindow;
}