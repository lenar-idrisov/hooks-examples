import {useEffect, useRef} from 'react';

export default function useAddEventListener(eventName, callback, delay) {
    const savedCallback = useRef();

    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    useEffect(() => {
        const listener = _ => {
            if (delay) {
                setTimeout(_ => savedCallback.current(), delay);
            } else {
                savedCallback.current();
            }
        }
        window.addEventListener(
            eventName,
            listener
        );
        return _ => {
            window.removeEventListener(eventName, listener);
        }
    }, []);
}