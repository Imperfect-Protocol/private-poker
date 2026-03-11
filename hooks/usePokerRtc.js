import { useEffect, useRef, useState, useCallback } from 'react';
import { useConnection } from 'wagmi';
import { toHex, hexToBytes } from 'viem';
import { usePrivatePokerSignal, useListenForSignals } from '@/hooks/usePrivatePokerSignal';
import { encryptForPeer, decryptFromPeer } from '@/lib/crypto';

export function usePokerRTC(tableId, lobbyId, blsKeys, tableCreatorAddress, tableCreatorPubKey, onMessage) {
  const { address } = useConnection();
  const { sendSignal } = usePrivatePokerSignal();
  const [status, setStatus] = useState('connecting');
  const peersRef = useRef({});
  const hasInitiatedRef = useRef(false);

  // 1. Listen for targeted signals
  useListenForSignals(address, async (signalData) => {
    if (!blsKeys?.privateKey) return;

    // Filter out signals for different tables
    if (signalData.tableId !== tableId.toString() || signalData.lobbyId !== lobbyId.toString()) return;

    try {
      // Decode and decrypt the payload
      const payloadString = new TextDecoder().decode(hexToBytes(signalData.encryptedData));
      const encryptedPayload = JSON.parse(payloadString);

      const decryptedString = await decryptFromPeer(blsKeys.privateKey, encryptedPayload);
      const signal = JSON.parse(decryptedString);

      handleIncomingSignal(signalData.sender, signal);
    } catch (err) {
      console.error("Failed to decrypt signal from", signalData.sender, err);
    }
  });

  // 2. Process the decrypted WebRTC signals
  const handleIncomingSignal = async (senderAddress, signal) => {
    let pc = peersRef.current[senderAddress];
    if (!pc) pc = createPeerConnection(senderAddress, signal.senderPubKey);

    if (signal.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // The creator sends the answer back to the joiner
      broadcastSignal(senderAddress, signal.senderPubKey, answer);
    } else if (signal.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (signal.type === 'ice-candidate') {
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  };

  // 3. Encrypt and send signals to a specific peer
  const broadcastSignal = useCallback(async (recipientAddress, recipientPubKey, data) => {
    if (!blsKeys?.publicKey) return;

    const payloadWithPubKey = { ...data, senderPubKey: blsKeys.publicKey };
    const jsonString = JSON.stringify(payloadWithPubKey);

    const encryptedPayload = await encryptForPeer(recipientPubKey, jsonString);
    const bytesData = toHex(new TextEncoder().encode(JSON.stringify(encryptedPayload)));

    await sendSignal(lobbyId, tableId, recipientAddress, bytesData);
  }, [blsKeys, lobbyId, tableId, sendSignal]);

  // 4. Create the connection and data channel
  const createPeerConnection = useCallback((peerAddress, peerPubKey) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Send ICE candidates to the specific peer
        broadcastSignal(peerAddress, peerPubKey, { type: 'ice-candidate', candidate: event.candidate });
      }
    };

    // If we are the ones creating the connection, set up the data channel
    const dc = pc.createDataChannel("poker-channel");
    setupDataChannel(dc);

    // Also listen for data channels created by the other side
    pc.ondatachannel = (event) => setupDataChannel(event.channel);

    peersRef.current[peerAddress] = pc;
    return pc;
  }, [broadcastSignal]);

  const setupDataChannel = (dc) => {
    dc.onmessage = (e) => onMessage(JSON.parse(e.data));
    dc.onopen = () => setStatus('connected');
  };

  // 5. Joiner Initiation Flow
  useEffect(() => {
    // We only want this to run once when the user joins
    if (hasInitiatedRef.current) return;
    if (!address || !tableCreatorAddress || !tableCreatorPubKey || !blsKeys?.publicKey) return;

    const isCreator = address.toLowerCase() === tableCreatorAddress.toLowerCase();

    // If I am not the creator, knock on their door
    if (!isCreator) {
      hasInitiatedRef.current = true;

      const initiateConnection = async () => {
        try {
          // We can just call our functions here without putting them in the array 
          // as long as we know they aren't trapping old state.
          const pc = createPeerConnection(tableCreatorAddress, tableCreatorPubKey);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          broadcastSignal(tableCreatorAddress, tableCreatorPubKey, offer);
        } catch (error) {
          console.error("Failed to initiate WebRTC:", error);
        }
      };

      initiateConnection();
    }

    // Look at how much cleaner this is! Just the raw data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, tableCreatorAddress, tableCreatorPubKey, blsKeys?.publicKey]);

  const sendMessage = (msg) => {
    Object.values(peersRef.current).forEach(pc => {
      // Find data channels and send
    });
  };

  return { status, sendMessage };
}