import { useState } from "react";
import { useSelector } from "react-redux";
import useWithDispatch from "../base/useWithDispatch";
import { sendAvatarImage, sendSettingsReady } from "../../api/sendDataOnline";
import { playersSlice } from "../../store/reducers/players";

import { getResizedImage, getSettingsForSending } from "../../helpers/mainUtils";
import { onlineDataSlice } from "../../store/reducers/onlineData";
import { getVacantPlayerName, validatePlayerName } from "../../api/getDataOnline";
import { settingsSlice } from "../../store/reducers/settings";
import { baseData } from "../../constants/base";


// подготовка колоды (простой и магической) до начала игры
export default function useLocalSetup(switchWindow, changeSettings) {
	const [userState] = useSelector((state) => state.players);
	const settingsState = useSelector((state) => state.settings);
	const { linkSenderId } = useSelector((state) => state.onlineData);

	const { setPartialSettings } = useWithDispatch(settingsSlice);
	let { setPlayerAvatar, setPlayerName } = useWithDispatch(playersSlice);
	let {
		setFriendData,
		setSendingInvitationStatus,
		setFriendChangedStatus,
		setLinkSenderId
	} = useWithDispatch(onlineDataSlice);


	// ошибка проверки введенного имени игрока
	const [isNameError, setNameError] = useState(false);
	// можно ли менять настройки
	const [isAvatarListDisabled, setAvatarListDisabled] = useState(false);

	const changeAvatarUrl = async (value) => {
		if (isAvatarListDisabled || settingsState.isSetComplete) return;
		const file = value.target.files[0];
		// загружаем только картинку и не более 20мб
		const allowMIMETypes = [
			'image/jpeg',
			'image/jpg',
			'image/png',
			'image/gif'
		]
		if (!file || !allowMIMETypes.includes(file.type) || file.size > baseData.maxAvatarSize) {
			// TODO: // показ ошибки: допустимы только png jpg jpeg bmp TIFF
			switchWindow('push', 'friendChanged', true, true);
			setFriendChangedStatus('failAvatarUpload');
			return;
		}
		// если адрес уже был создан - освобождаем память
		if (userState.avatarUrl) {
			URL.revokeObjectURL(userState.avatarUrl);
		}
		const formData = new FormData();
		const fileUrl = URL.createObjectURL(file);
		setPlayerAvatar({ playerId: userState.id, avatarUrl: fileUrl });

		const resizesFile = await getResizedImage(file);
		formData.append("file", resizesFile);
		formData.append("id", userState.id);

		setAvatarListDisabled(true);
		// сразу шлем сам файл на сервер
		sendAvatarImage(formData);
	};

	const changeAvatarIndex = (index) => {
		if (isAvatarListDisabled || settingsState.isSetComplete) return;
		setPlayerAvatar({ playerId: userState.id, avatarIndex: index });
	};

	const changeName = (event) => {
		if (settingsState.isSetComplete) return;
		const name = event.target.value;
		const regExpForValidateStr = /(<|>|&|\/|'|")/g;
		if (regExpForValidateStr.test(name)) return;

		setPlayerName({ playerId: userState.id, data: name });
		validatePlayerName(name, (isNameValidated) => {
			setNameError(!isNameValidated);
			setPlayerName({ playerId: userState.id, data: name });
		});
	};

	const generateNewName = () => {
		if (settingsState.isSetComplete) return;
		getVacantPlayerName(window.lang, (newName) => {
			if (newName) {
				setNameError(false);
				setPlayerName({ playerId: userState.id, data: newName });
			}
		});
	};

	const switchOption = (key) => {
		// если игра уже начата - не даем менять некоторые настройки
		if (key !== 'isSoundOn' && settingsState.isSetComplete) {
			return;
		}
		const option = settingsState[key];
		const updatedOptions = {
			isSettingsChangedManually: true,
			[key]: !option,
		};
		changeSettings(updatedOptions);
	};

	// проверяем - не пришел ли юзер по ссылке
	const handleGameStartByLink = (friendData) => {
		const clearUrl = (_) => {
			// чистим адресную строку
			window.history.pushState("", "", window.location.origin);
			setLinkSenderId(null);
		};
		if (friendData) {
			setFriendData(friendData);
			setSendingInvitationStatus('isSuccess');
			// переходим на следующую страницу, открываем окно ожидания друга по ссылке
			// слишком быстро игра начинается -в этом окне нету смысла, закомментировал
			// switchWindow('push', 'sendingInvitation', false, true);
			// ждем от сервера данных для запуска игры...
		} else if (linkSenderId) {
			// друг по ссылке уже не доступен
			setFriendChangedStatus('friendByLinkUndefined');
			switchWindow('push', 'friendChanged', true, true);
		} else {
			// переходим на окно списка доуступных игроков
		}
		clearUrl();
	};

	const saveSetup = () => {
		// если игра уже настроена - просто закрываем окно
		if (settingsState.isSetComplete && !linkSenderId) return;
		// еще раз проверяем навсяки имя
		validatePlayerName(userState.name, (isNameValidated) => {
			if (!isNameValidated) {
				setNameError(!isNameValidated);
			} else {
				setPartialSettings({ isSetComplete: true });
				const trimmedName = userState.name.trim().replace(/\s+/g, ' ');
				// если все норм - отправляем на сервер выбранные настройки
				setPlayerName({ playerId: userState.id, data: trimmedName });
				const userData = {
					name: trimmedName,
					avatarIndex: userState.avatarIndex,
					settings: getSettingsForSending(settingsState),
				};
				sendSettingsReady(userData, linkSenderId, handleGameStartByLink);
			}
		});
	};

	return {
		changeAvatarUrl,
		changeAvatarIndex,
		changeName,
		switchOption,
		isNameError,
		isAvatarListDisabled,
		generateNewName,
		saveSetup,
	};
}