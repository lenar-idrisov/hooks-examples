import { useEffect, useRef } from "react";
import useWithDispatch from "../base/useWithDispatch";
import { deckSlice } from "../../store/reducers/deck";


// подготовка колоды (простой и магической) до начала игры
export default function useImportedImages() {
    const { updateDeck } = useWithDispatch(deckSlice);


    const cardsImagesRef = useRef({
        simple: {},
        magic: {},
    });

    const logoImagesRef = useRef([]);
    const avatarImagesRef = useRef([]);

    useEffect(() => {
        importCardsImages();
        importLogoImages();
        importAvatarImages();
    }, []);


    // импортирует изображения в указанных каталогах + во вложенных каталогах
    const importCardsImages = () => {
        const initialDeck = {
            simpleCardsBasic: [],
            simpleCards: [],
            magicCards: []
        }
        // импортирует 3 вложенные подпапки /magic, /magicPreview, /simple
        const cardsModules = require.context('../../assets/image/cards', true, /\.png/);
        cardsModules.keys().forEach((card) => {
            /* card= "./magic/10-1.svg" */
            /* card= "./magicPreview/10-1.svg" */
            const parsedCardName = card.match(/\/(\w+)\/(\d+)-(\d+)/);
            const type = parsedCardName[1];
            const num = Number(parsedCardName[2]);
            const modi = Number(parsedCardName[3]);
            const path = num + '-' + modi;
            cardsImagesRef.current[type][path] = cardsModules(card);

            if (type === 'simple') {
                // @ts-ignore
                initialDeck.simpleCards.push({
                    path,
                    digit: num,
                    suit: modi
                });
            } else if (type === 'magic') {
                // @ts-ignore
                initialDeck.magicCards.push({
                    path,
                    num,
                    modi
                });
            }
        });
        // будет хранить исходную колоду при перезапусках
        initialDeck.simpleCardsBasic = initialDeck.simpleCards.map(card => ({...card}));
        updateDeck(initialDeck);
    };

    // импортируем картинки-пауз
    const importLogoImages = () => {
        const imageModules = require.context('../../assets/image/logo', true, /\.png/);
        logoImagesRef.current = imageModules.keys().map(path => imageModules(path));
    };

    // импортируем картинки-пауз
    const importAvatarImages = () => {
        const imageModules = require.context('../../assets/image/avatars/recommended', true, /\.png/);
        avatarImagesRef.current = imageModules.keys().map(path => imageModules(path));
    };


    return {
        // данные будут только для чтения
        cardsImages: { ...cardsImagesRef.current },
        logoImages: [...logoImagesRef.current],
        avatarImages: [...avatarImagesRef.current],
    };
}