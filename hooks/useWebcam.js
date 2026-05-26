"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

export function useWebcam() {
  const streamRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setIsEnabled(false);
    setIsStarting(false);
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current || isStarting) return streamRef.current;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const nextError = new Error('Webcam is not available in this browser');
      setError(nextError);
      return null;
    }

    setIsStarting(true);
    setError(null);

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
        },
      });

      nextStream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', stop, { once: true });
      });

      streamRef.current = nextStream;
      setStream(nextStream);
      setIsEnabled(true);
      return nextStream;
    } catch (nextError) {
      setError(nextError);
      return null;
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, stop]);

  const toggle = useCallback(() => {
    if (streamRef.current) {
      stop();
      return;
    }

    void start();
  }, [start, stop]);

  useEffect(() => stop, [stop]);

  return {
    stream,
    isEnabled,
    isStarting,
    error,
    start,
    stop,
    toggle,
  };
}
