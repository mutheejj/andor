import React, { useState } from 'react';

interface StopButtonProps {
  onStop: () => void;
}

export function StopButton({ onStop }: StopButtonProps) {
  const [confirming, setConfirming] = useState(false);

  const handleClick = () => {
    if (confirming) {
      onStop();
      setConfirming(false);
    } else {
      setConfirming(true);
      // Auto-reset after 3 seconds
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="px-2 py-0.5 rounded text-[10px] font-bold transition-all"
      style={{
        background: confirming ? '#d32f2f' : '#c62828',
        color: '#fff',
        border: 'none',
        cursor: 'pointer',
      }}
      title={confirming ? 'Click again to confirm stop' : 'Stop all agents'}
    >
      {confirming ? '■ CONFIRM STOP' : '■ STOP'}
    </button>
  );
}
