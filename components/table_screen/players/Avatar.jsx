"use client";

import { useEffect, useRef } from 'react';

export default function Avatar({
  player,
  isMe,
  isEmptySeat,
  isTheirTurn,
  isWinner = false,
  webcamStream = null,
  isWebcamStarting = false,
  onToggleWebcam = null,
}) {
  const videoRef = useRef(null);
  const borderClass = isEmptySeat
    ? 'border-dashed border-slate-600 shadow-none'
    : isWinner
      ? 'border-emerald-300 shadow-[0_0_26px_rgba(110,231,183,0.75)] animate-pulse'
      : isMe
        ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)]'
        : 'border-teal-500 shadow-[0_0_15px_rgba(20,184,166,0.5)]';

  const displayName = player.displayName?.startsWith?.('0x') ? '' : player.displayName;
  const nameParts = displayName?.split(/\s+/).filter(Boolean) ?? [];
  const initials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts.at(-1)[0]}`
    : nameParts[0]?.slice(0, 2);
  const canToggleWebcam = isMe && !isEmptySeat && typeof onToggleWebcam === 'function';

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = webcamStream;
  }, [webcamStream]);

  const sizeClass = isMe
    ? 'h-[4.8125rem] w-[4.8125rem] md:h-[5.5rem] md:w-[5.5rem]'
    : 'h-[4.375rem] w-[4.375rem] md:h-20 md:w-20';

  return (
    <button
      type="button"
      className={`${sizeClass} rounded-full bg-slate-950 border-2 ${borderClass} flex items-center justify-center relative overflow-hidden group-hover:scale-110 transition-transform z-10 ${canToggleWebcam ? 'cursor-pointer' : 'cursor-default'}`}
      onClick={canToggleWebcam ? onToggleWebcam : undefined}
      disabled={!canToggleWebcam}
      title={canToggleWebcam ? 'Toggle webcam' : undefined}
    >
      <div className={`absolute inset-0 bg-gradient-to-tr ${isEmptySeat ? 'from-slate-800/50 to-transparent' : 'from-teal-900/50 to-transparent'}`} />
      {webcamStream ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`absolute inset-0 h-full w-full object-cover ${isMe ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <span className={`relative z-10 text-xl font-black uppercase italic ${isEmptySeat ? 'text-slate-600' : 'text-white'}`}>
          {isWebcamStarting ? '...' : isEmptySeat ? '+' : initials || player.playerAddress?.substring(2, 4)}
        </span>
      )}

      {isTheirTurn && !isWinner && (
        <div className="absolute bottom-0 w-full h-1.5 bg-cyan-400 animate-pulse" />
      )}
      {isWinner && (
        <div className="absolute bottom-0 w-full h-1.5 bg-emerald-300 animate-pulse" />
      )}
    </button>
  );
}
