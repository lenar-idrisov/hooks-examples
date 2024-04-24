import { useContext, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { AudioPlayerContext } from '../..';


export default function useTimer(
    timeMsec,
    reasonToStartId,
    isTabloTime,
    isIgnoreGameFrozen
) {
    const audioPlayer = useContext(AudioPlayerContext);
    const liveTimerId = useRef(null);
    const [liveTimeSec, setLiveTimeSec] = useState(0);
    const { isGameFrozen } = useSelector(state => state.app);
    const { activeId } = useSelector(state => state.party);
    const [userState] = useSelector(state => state.players);

    useEffect(() => {
        if (reasonToStartId) {
            start();
        }
        return () => stop();
    }, [reasonToStartId]);

    useEffect(() => {
        if (isGameFrozen && !isIgnoreGameFrozen) {
            audioPlayer.stop('timer');
            stop();
        }
    }, [isGameFrozen]);


    const getBeautifulTime =
        (val) => (val >= 10 || val === 0 ? val : "0" + val)

    const start = () => {
        let tabloTimeFullSec = timeMsec / 1000;
        setLiveTimeSec(tabloTimeFullSec);
        liveTimerId.current = setInterval(() => {
            // таймер в данном случае не на state опирается,
            // в на время из замыкания
            timer(--tabloTimeFullSec);
        }, 1000
        );
    }

    const stop = () => {
        clearInterval(liveTimerId.current);
        liveTimerId.current = null;
    }

    const timer = (timeLeft) => {
        if (timeLeft === 15 && isTabloTime && userState.id === activeId) {
            audioPlayer.play('timer');
        }
        if (timeLeft <= 0) {
            setLiveTimeSec(timeLeft);
            stop();
        } else {
            setLiveTimeSec(timeLeft);
        }
    }

    return getBeautifulTime(liveTimeSec);
}