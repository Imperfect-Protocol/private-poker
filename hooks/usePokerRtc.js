"use client";
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export const usePokerRTC = (roomId) => {
  const [status, setStatus] = useState("initializing");
  const socketRef = useRef();
  const pcRef = useRef(); // PeerConnection
  const dcRef = useRef(); // DataChannel

  useEffect(() => {
    socketRef.current = io("http://localhost:3001");

    // 1. Setup PeerConnection
    pcRef.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }] // Free Google STUN
    });

    // 2. Handle ICE Candidates (Finding the route)
    pcRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("signal", { 
          to: roomId, 
          signal: { type: "ice", candidate: event.candidate } 
        });
      }
    };

    // 3. Listen for Incoming DataChannel (for the "Answerer")
    pcRef.current.ondatachannel = (event) => {
      dcRef.current = event.channel;
      setupDataChannel();
    };

    socketRef.current.on("player-joined", async (peerId) => {
      console.log("🛰️ New Peer. Creating Offer...");
      
      // 4. Create DataChannel (for the "Offerer")
      dcRef.current = pcRef.current.createDataChannel("poker-data");
      setupDataChannel();

      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      socketRef.current.emit("signal", { to: peerId, signal: offer });
    });

    socketRef.current.on("signal", async ({ from, signal }) => {
      if (signal.type === "offer") {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socketRef.current.emit("signal", { to: from, signal: answer });
      } else if (signal.type === "answer") {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.type === "ice") {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    });

    const setupDataChannel = () => {
      dcRef.current.onopen = () => setStatus("connected");
      dcRef.current.onmessage = (e) => console.log("📩 Received:", e.data);
    };

    return () => socketRef.current.disconnect();
  }, [roomId]);

  const sendGameState = (data) => {
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify(data));
    }
  };

  return { status, sendGameState };
};