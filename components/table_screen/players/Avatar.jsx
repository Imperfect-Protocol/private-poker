"use client";

import { Mic, MicOff } from 'lucide-react';
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
  isAudioEnabled = false,
  isAudioStarting = false,
  onToggleAudio = null,
}) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const borderClass = isEmptySeat
    ? 'border-dashed border-[#303948]/70 shadow-none'
    : isWinner
      ? 'border-4 border-yellow-200 shadow-[0_0_30px_rgba(250,204,21,0.85),0_0_14px_rgba(255,237,213,0.72),inset_0_0_18px_rgba(250,204,21,0.2)]'
      : isTheirTurn
        ? 'border-amber-300 shadow-[0_0_30px_rgba(245,158,11,0.68),0_0_12px_rgba(251,191,36,0.45),inset_0_0_18px_rgba(245,158,11,0.18)]'
        : isMe
          ? 'border-[#5d6c84] shadow-[0_0_22px_rgba(96,116,145,0.42),inset_0_0_18px_rgba(68,82,104,0.22)]'
          : 'border-[#435064]/90 shadow-[0_0_16px_rgba(59,74,96,0.36),inset_0_0_14px_rgba(96,116,145,0.16)]';

  const displayName = player.displayName?.startsWith?.('0x') ? '' : player.displayName;
  const nameParts = displayName?.split(/\s+/).filter(Boolean) ?? [];
  const initials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts.at(-1)[0]}`
    : nameParts[0]?.slice(0, 2);
  const canToggleWebcam = isMe && !isEmptySeat && typeof onToggleWebcam === 'function';
  const canToggleAudio = isMe && !isEmptySeat && typeof onToggleAudio === 'function';
  const hasVideo = webcamStream?.getVideoTracks?.().some((track) => track.readyState !== 'ended') ?? false;
  const hasRemoteAudio = !isMe && (webcamStream?.getAudioTracks?.().some((track) => track.readyState !== 'ended') ?? false);

  useEffect(() => {
    if (!videoRef.current) return;
    const videoTracks = webcamStream?.getVideoTracks?.().filter((track) => (
      track.readyState !== 'ended'
    )) ?? [];
    videoRef.current.srcObject = videoTracks.length > 0 ? new MediaStream(videoTracks) : null;
  }, [webcamStream]);

  useEffect(() => {
    if (!audioRef.current) return;
    const audioTracks = hasRemoteAudio
      ? webcamStream.getAudioTracks().filter((track) => track.readyState !== 'ended')
      : [];
    audioRef.current.srcObject = audioTracks.length > 0 ? new MediaStream(audioTracks) : null;
    audioRef.current.volume = 1;
    if (audioTracks.length > 0) {
      audioRef.current.play().catch((error) => {
        console.log('[RTC debug] remote audio playback blocked', error);
      });
    }
  }, [hasRemoteAudio, webcamStream]);

  const sizeClass = isMe
    ? 'h-[4.8125rem] w-[4.8125rem] md:h-[5.5rem] md:w-[5.5rem]'
    : 'h-[4.375rem] w-[4.375rem] md:h-20 md:w-20';

  return (
    <div className="relative z-10">
      <button
        type="button"
        className={`${sizeClass} rounded-full bg-[#080d16] border-2 ${borderClass} flex items-center justify-center relative overflow-hidden group-hover:scale-110 transition-transform ${canToggleWebcam ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={canToggleWebcam ? onToggleWebcam : undefined}
        disabled={!canToggleWebcam}
        title={canToggleWebcam ? 'Toggle webcam' : undefined}
      >
        <div className={`absolute inset-0 bg-gradient-to-tr ${isEmptySeat ? 'from-[#172033]/55 to-transparent' : 'from-[#172235]/54 to-transparent'}`} />
        {hasVideo ? (
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
          <div className="absolute bottom-0 w-full h-1.5 bg-orange-300 shadow-[0_0_16px_rgba(251,191,36,0.95),0_0_8px_rgba(255,237,213,0.7)] animate-pulse" />
        )}
        {isWinner && (
          <div className="absolute bottom-0 w-full h-1.5 bg-emerald-300 animate-pulse" />
        )}
      </button>

      {hasRemoteAudio && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
        />
      )}

      {canToggleAudio && (
        <button
          type="button"
          className={`absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border text-white shadow-lg transition-transform hover:scale-110 ${isAudioEnabled ? 'border-yellow-300 bg-yellow-500/90 text-slate-950 shadow-[0_0_14px_rgba(250,204,21,0.45)]' : 'border-slate-600 bg-slate-950/95 text-slate-300'}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleAudio?.();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          title="Toggle microphone"
        >
          {isAudioStarting ? (
            <span className="text-[10px] font-black">...</span>
          ) : isAudioEnabled ? (
            <Mic size={15} />
          ) : (
            <MicOff size={15} />
          )}
        </button>
      )}
    </div>
  );
}
