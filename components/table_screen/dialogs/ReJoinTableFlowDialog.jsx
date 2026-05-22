"use client";

import { useEffect, useRef, useState } from 'react';
import FlowStepDialog from '@/components/table_screen/dialogs/FlowStepDialog';

const connectionStatus = (state) => {
  if (state === 'Connected') return 'complete';
  if (state === 'Disconnected') return 'error';
  if (state === 'OfferSent' || state === 'AcceptSent' || state === 'AcceptReceived' || state === 'Created') return 'active';
  return 'pending';
};

export default function ReJoinTableFlowDialog({
  table,
  networkSnapshot,
  onEnableNetwork,
  onReady,
}) {
  const startedRef = useRef(false);
  const [signatureStatus, setSignatureStatus] = useState('pending');
  const [error, setError] = useState('');

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      try {
        setSignatureStatus('active');
        await table.prepareNetworkSession();
        setSignatureStatus('complete');
        onEnableNetwork?.();
      } catch (err) {
        console.error(err);
        setSignatureStatus('error');
        setError(err.shortMessage || err.details || err.message || 'Table session authorization failed.');
      }
    };

    run();
  }, [onEnableNetwork, table]);

  const inboundStatus = connectionStatus(networkSnapshot?.inboundState);
  const outboundStatus = connectionStatus(networkSnapshot?.outboundState);
  const isComplete = signatureStatus === 'complete'
    && inboundStatus === 'complete'
    && outboundStatus === 'complete';

  return (
    <FlowStepDialog
      title="Joining P2P Network"
      description="We will restore your table session and connect the inbound and outbound poker channels. The table stays locked until peers are connected."
      error={error}
      isComplete={isComplete}
      onOk={onReady}
      steps={[
        { id: 'signature', label: 'Generate table BLS key', status: signatureStatus },
        {
          id: 'inbound',
          label: 'Peer Connection Inbound',
          status: inboundStatus,
          action: inboundStatus === 'error' ? (
            <button
              type="button"
              onClick={() => table.retryInboundConnection?.()}
              className="rounded border border-red-400/50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-red-200 transition-colors hover:border-red-300 hover:bg-red-400/10"
            >
              Retry
            </button>
          ) : null,
        },
        { id: 'outbound', label: 'Peer Connection Outbound', status: outboundStatus },
      ]}
    />
  );
}
