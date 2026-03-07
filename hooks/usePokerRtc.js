"use client";
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export const usePokerRTC = (roomId, onMessageReceived) => {
  const [status, setStatus] = useState("initializing");
  const socketRef = useRef();
  const pcRef = useRef();
  const dcRef = useRef();

  useEffect(() => {
    socketRef.current = io("http://localhost:3001", { transports: ["websocket"] });

    const initPeerConnection = async (peerId, isOffer) => {
      pcRef.current = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

      pcRef.current.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current.emit("signal", { to: peerId, signal: { type: "ice", candidate: e.candidate } });
        }
      };

      pcRef.current.oniceconnectionstatechange = () => {
        if (pcRef.current.iceConnectionState === "connected") setStatus("connected");
      };

      if (isOffer) {
        dcRef.current = pcRef.current.createDataChannel("poker-data");
        setupDataChannel(dcRef.current);
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        socketRef.current.emit("signal", { to: peerId, signal: offer });
      } else {
        pcRef.current.ondatachannel = (e) => {
          dcRef.current = e.channel;
          setupDataChannel(dcRef.current);
        };
      }
    };

    socketRef.current.on("connect", () => {
      socketRef.current.emit("join-room", roomId);
    });

    // If we join and others are there, we initiate
    socketRef.current.on("existing-peers", (peers) => {
      peers.forEach(id => initPeerConnection(id, true));
    });

    // If we are there and someone else joins, they will initiate (or we can)
    socketRef.current.on("player-joined", (id) => {
      console.log("Peer found:", id);
      // We wait for their offer
    });

    socketRef.current.on("signal", async ({ from, signal }) => {
      if (signal.type === "offer") {
        if (!pcRef.current) await initPeerConnection(from, false);
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socketRef.current.emit("signal", { to: from, signal: answer });
      } else if (signal.type === "answer") {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.type === "ice") {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    });

    const setupDataChannel = (channel) => {
      channel.onopen = () => setStatus("connected");
      channel.onmessage = (e) => onMessageReceived && onMessageReceived(JSON.parse(e.data));
    };

    return () => socketRef.current.disconnect();
  }, [roomId]);

  const sendMessage = (data) => {
    if (dcRef.current?.readyState === "open") dcRef.current.send(JSON.stringify(data));
  };

  return { status, sendMessage };
};