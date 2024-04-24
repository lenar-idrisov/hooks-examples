import { useContext, useState } from "react";
import { AdvContext, AudioPlayerContext } from "../../index";
import useWithDispatch from "../base/useWithDispatch";
import { appSlice } from "../../store/reducers/app";
import { nanoid } from "nanoid";
import useAddEventListener from "./useAddEventListener";
import useTimeout from "../base/useTimeout";
import { useSelector } from "react-redux";


export default function useSubscribeEvents(switchWindow) {
	const advManager = useContext(AdvContext);
	const audioPlayer = useContext(AudioPlayerContext);
	const settingsState = useSelector((state) => state.settings);
	const { setGameSizes } = useWithDispatch(appSlice);

	const [isBlurAdvEnable, setBlurAdvEnable] = useState(true);
	const [isBlurEnableDef, setBlurEnableDef] = useState(false);

	const advShowInterval = 5 * 60 * 1000; // мсек


	useTimeout(
		_ => setBlurAdvEnable(true),
		advShowInterval,
		isBlurEnableDef,
		true
	);

	// событие изменения размера окна
	useAddEventListener("resize", _ => {
		setGameSizes(nanoid());
		advManager.setStickyBannerVisible();
	});

	// реклама при покидании вкладки
	useAddEventListener(
		"blur",
		_ => {
			audioPlayer.stopAll();
		},
		0
	);

	useAddEventListener(
		"focus",
		_ => {
			if (settingsState.isSoundOn) {
				audioPlayer.switchEnable(true);
			}
			if (isBlurAdvEnable) {
				advManager.showFullscreenAdv(audioPlayer);
				setBlurAdvEnable(false);
				setBlurEnableDef(nanoid());
			}
		},
		300
	);


	function showInternetError(value) {
		switchWindow("notice", "internetError", true, value);
	}

	useAddEventListener("online", _ => showInternetError(false), 300);
	useAddEventListener("offline", _ => showInternetError(true), 300);
}