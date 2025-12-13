import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface GameTimerProps {
  isGameStarted: boolean;
  isGameEnded: boolean;
}

export function GameTimer({ isGameStarted, isGameEnded }: GameTimerProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!isGameStarted || isGameEnded) return;

    const interval = setInterval(() => {
      setSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isGameStarted, isGameEnded]);

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}m${secs.toString().padStart(2, '0')}s`;
  };

  return (
    <div className="card flex flex-col items-center justify-center" style={{ height: '100%' }}>
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-5 h-5 text-gray-700" />
        <h3 className="text-base font-bold text-gray-800">Game Timer</h3>
      </div>
      <div className="text-3xl font-bold text-gray-800 tabular-nums">
        {formatTime(seconds)}
      </div>
    </div>
  );
}
