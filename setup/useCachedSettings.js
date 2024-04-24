import { useContext, useEffect } from "react";
import * as baseUtils from "../../helpers/baseUtils";
import { useSelector } from "react-redux";
import useWithDispatch from "../base/useWithDispatch";
import { AudioPlayerContext } from "../../index";
import { settingsSlice } from "../../store/reducers/settings";
import { cachedSettings } from "../../constants/base";


// подготовка колоды (простой и магической) до начала игры
export default function useCachedSettings() {
    const audioPlayer = useContext(AudioPlayerContext);
    const settingsState = useSelector(state => state.settings);
    const { setPartialSettings } = useWithDispatch(settingsSlice);


    useEffect(() => {
        if (!settingsState.isSetComplete) {
            // если юзер ранее настраивал игру, активируем сохраненные настройки
            let savedSettings = getSafeSettings(baseUtils.localStateWorker('read', 'settings'));
            if (savedSettings && Object.keys(savedSettings).length !== 0) {
                changeSettings(savedSettings);
            }
        }
    }, []);

    // юзер может в localState фигню напихать
    function getSafeSettings(savedSettings) {
        const safeKeys = Object.keys(settingsState);
        let clearedSettings = {};
        for (const key in savedSettings) {
            if (safeKeys.includes(key) && cachedSettings.includes(key)) {
                clearedSettings[key] = !!savedSettings[key];
            }
        }
        return clearedSettings;
    }

    const changeSettings = (newPartialSettings) => {
        setPartialSettings(newPartialSettings);
        // если переключили звук, настроим аудио плеер
        if (newPartialSettings.isSoundOn !== undefined) {
            audioPlayer.switchEnable(newPartialSettings.isSoundOn);
        }
        // не все настройки надо при следующем запуске восстанавливать
        baseUtils.localStateWorker('write', 'settings', getSafeSettings(newPartialSettings));
    }

    return changeSettings;
}