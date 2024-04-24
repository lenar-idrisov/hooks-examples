import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";


export default function useTimeout(
    callback,
    timeMsec,
    reasonToStartId,
    isIgnoreGameFrozen
) {
    const { isGameFrozen } = useSelector(state => state.app);
    const savedCallback = useRef();
    const timeId = useRef();

    function clear() {
        clearTimeout(timeId.current);
        savedCallback.current = null;
    }


    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);


    useEffect(() => {
        if (!reasonToStartId) return;
        timeId.current = setTimeout(
            () => savedCallback.current(),
            timeMsec
        );
        return clear;
    }, [reasonToStartId]);


    useEffect(() => {
        if (isGameFrozen && !isIgnoreGameFrozen) {
            clear();
        }
    }, [isGameFrozen]);
}