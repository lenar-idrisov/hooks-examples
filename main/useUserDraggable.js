// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import useWithDispatch from "../base/useWithDispatch";
import { userDroppedSlice } from "../../store/reducers/userDropped";
import { commandsSlice } from "../../store/reducers/commands";
import { useSelector } from "react-redux";
import DroppedHelper from "../../helpers/DroppedHelper";


export default function useUserDraggable(cardSizes, boardSizes, isEnableStartDragging) {
    const { setPlayerCommand } = useWithDispatch(commandsSlice);
    const { setDroppedData } = useWithDispatch(userDroppedSlice);
    const startPositions = useRef(null);
    const cursorShift = useRef(null);
    // координаты карты при перетаскивании
    const [draggableXY, setDraggableXY] = useState(null);
    // id перетаскиваемой/опущенной карты
    const [droppedId, setDroppedId] = useState(null);
    const droppedCardsState = useSelector(state => state.droppedCards);

    const moveHandlerRef = useRef(null);
    const moveEndHandlerRef = useRef(null);
    const [userState] = useSelector(state => state.players);
    const { attackId, activeId } = useSelector(state => state.party);

    const isEnableToDropRef = useRef(null);
    const droppedCardsOldQtyRef = useRef(null);


    // после того как карту начали перетаскивать,
    // противник может успеть положить свою карту до нас + измениться активный игрок
    useEffect(() => {
        if (!droppedId) return;
        isEnableToDropRef.current = (userState.id === attackId || userState.id === activeId) &&
            droppedCardsOldQtyRef.current === DroppedHelper.getAllCardsQty(droppedCardsState);
    }, [
        activeId,
        droppedCardsState
    ])

    useEffect(() => {
        if (droppedId) {
            moveHandlerRef.current = move;
            moveEndHandlerRef.current = moveEnd;
            document.addEventListener('pointermove', moveHandlerRef.current);
            document.addEventListener('pointerup', moveEndHandlerRef.current);
        } else {
            document.removeEventListener('pointermove', moveHandlerRef.current);
            document.removeEventListener('pointerup', moveEndHandlerRef.current);
        }
    }, [droppedId])


    const moveStart = (event, droppedId) => {
        if (!isEnableStartDragging) return;
        event.preventDefault();
        // зашиваем смещение курсора относительно краев поднятой карты
        cursorShift.current = {
            x: event.nativeEvent.offsetX || event.offsetX,
            y: event.nativeEvent.offsetY || event.offsetY
        }
        startPositions.current = {
            x: event.pageX,
            y: event.pageY,
        }
        setDroppedId(droppedId);
        setDraggableXY({
            x: 0,
            y: 0,
        });
        isEnableToDropRef.current = true;
        droppedCardsOldQtyRef.current = DroppedHelper.getAllCardsQty(droppedCardsState);
    }

    const move = (event) => {
        event.preventDefault();
        // при движении карты она позиционируется относительно
        // прежнего родителя(контейнер карты в личном составе) + смещение
        const shiftX = event.pageX - startPositions.current.x;
        const shiftY = event.pageY - startPositions.current.y;
        //const {cardWidth, cardHeight} = cardSizes;

        // нужно чтоб при вытаскивании карт остальные смещались и дыра не появлялась
        // TODO: пока с дырой пусть будет, в целом сносно
        /*if (Math.abs(shiftX) >= cardWidth * 1.4 ||
            Math.abs(shiftY) >= cardHeight * 1.4) {
            cardShapeClass = 'card-narrow';
            //shiftX -= cardWidth / 2;
        }*/
        setDraggableXY({
            x: shiftX,
            y: shiftY
        });
    }


    const moveEnd = (event) => {
        event.preventDefault();
        // по таймеру могло нажаться бито, до того, как чел успел положить карту
        if (!isEnableToDropRef.current) {
            setDraggableXY(null);
            setDroppedId(null);
            return;
        }
        const { spaceToLeft, spaceToTop } = boardSizes;
        // то же самое что и координаты draggable в обработчике move
        const shiftX = event.pageX - startPositions.current.x;
        const shiftY = event.pageY - startPositions.current.y;
        if (isNeedHandleDrop(shiftX, shiftY)) {
            // нужно транслировать координату выбранной карты
            // от системы координат контейнера карты к системе координат доски
            // переводим с помощью общей для них системы позиционирования "страница" page/pageY
            // + убираем лишнее, используя Element.getBoundingClientRect(), зашито  в boardSizes
            const droppedXY = {
                x: event.pageX - cursorShift.current.x - spaceToLeft,
                y: event.pageY - cursorShift.current.y - spaceToTop,
            }
            setDroppedData({
                droppedXY,
                droppedId,
                droppedCard: userState.simpleCards.find(card => card.id === droppedId)
            });
            setPlayerCommand('resolveUserDropped');
        }
        setDraggableXY(null);
        setDroppedId(null);
    }

    const isNeedHandleDrop = (droppedX, droppedY) => {
        const { cardWidth, cardHeight } = cardSizes;
        let delta = 15;
        return Math.abs(droppedX) > cardWidth + delta ||
            Math.abs(droppedY) > cardHeight + delta;
    }

    return {
        draggableXY,
        droppedId,
        moveStart
    };
}