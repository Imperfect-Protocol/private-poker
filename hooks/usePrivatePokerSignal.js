import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection } from 'wagmi';
import {
  getPrivateMeshUrl,
  pollPrivateMeshSignals,
  publishPrivateMeshSignals,
  subscribeToPrivateMeshSignals,
} from '@/lib/privateMeshSignal';

const normalizeAddress = (value) => value?.toLowerCase() ?? '';

const formatPeer = (value) => {
  const text = value ? String(value) : '';
  if (!text) return 'unknown';
  return text.length <= 12 ? text : `${text.slice(0, 6)}...${text.slice(-4)}`;
};

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

export function usePrivatePokerSignal({ playerAddress } = {}) {
  const { address } = useConnection();
  const senderAddress = playerAddress ?? address;
  const [isSendingSignal, setIsSendingSignal] = useState(false);

  const sendSignal = useCallback(async (lobbyId, tableId, recipientAddresses, encryptedDataBytes) => {
    if (!senderAddress) {
      throw new Error('Player address is required before publishing a Private Mesh signal.');
    }

    const recipients = asArray(recipientAddresses);
    const encryptedData = asArray(encryptedDataBytes);

    if (recipients.length !== encryptedData.length) {
      throw new Error('Signal recipient and payload counts must match.');
    }

    const signals = recipients.map((recipient, index) => ({
      recipient,
      encryptedData: encryptedData[index],
    }));

    console.log('[RTC signal] Private Mesh publish', {
      meshUrl: getPrivateMeshUrl(),
      lobbyId: lobbyId?.toString?.() ?? String(lobbyId),
      tableId: tableId?.toString?.() ?? String(tableId),
      recipients: recipients.map(formatPeer),
      payloads: encryptedData.length,
    });

    setIsSendingSignal(true);
    try {
      return await publishPrivateMeshSignals(signals);
    } finally {
      setIsSendingSignal(false);
    }
  }, [senderAddress]);

  return { sendSignal, isSendingSignal };
}

export function useListenForSignals(myPlayerAddress, lobbyId, tableId, onSignalReceived) {
  const onSignalReceivedRef = useRef(onSignalReceived);
  const seenSignalsRef = useRef(new Set());

  useEffect(() => {
    onSignalReceivedRef.current = onSignalReceived;
  }, [onSignalReceived]);

  useEffect(() => {
    if (!myPlayerAddress || !lobbyId || !tableId) return undefined;

    let stopped = false;
    const address = normalizeAddress(myPlayerAddress);

    const handleMeshSignal = (message) => {
      if (stopped || !message?.payload) return;
      const logId = message.id ?? `${message.sent_at}:${message.payload}`;
      if (seenSignalsRef.current.has(logId)) return;
      seenSignalsRef.current.add(logId);
      if (seenSignalsRef.current.size > 500) {
        const [oldestSignalId] = seenSignalsRef.current;
        seenSignalsRef.current.delete(oldestSignalId);
      }

      console.log('[RTC signal] Private Mesh signal received', {
        signalId: logId,
        recipient: formatPeer(message.recipient),
        bytes: Math.max(0, (String(message.signal ?? '').length - 2) / 2),
      });

      Promise.resolve(onSignalReceivedRef.current?.({
        sender: null,
        lobbyId: lobbyId.toString(),
        tableId: tableId.toString(),
        recipients: [address],
        encryptedData: message.payload,
        logId,
        isRecipient: true,
      })).catch((error) => {
        console.log('[RTC debug] Private Mesh signal callback failed', error);
      });
    };

    const unsubscribe = subscribeToPrivateMeshSignals(address, handleMeshSignal);
    const pollController = new AbortController();
    const poll = async () => {
      try {
        const messages = await pollPrivateMeshSignals(address, { signal: pollController.signal });
        messages.forEach(handleMeshSignal);
      } catch (error) {
        if (!stopped && error?.name !== 'AbortError') {
          console.log('[RTC signal] Private Mesh poll failed', error);
        }
      }
    };
    const pollTimer = setInterval(poll, 1000);
    poll();

    console.log('[RTC signal] Private Mesh ready', {
      meshUrl: getPrivateMeshUrl(),
      recipient: formatPeer(address),
    });

    return () => {
      stopped = true;
      unsubscribe?.();
      pollController.abort();
      clearInterval(pollTimer);
    };
  }, [lobbyId, myPlayerAddress, tableId]);
}
