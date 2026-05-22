"use client";

import { useEffect, useRef, useState } from 'react';
import FlowStepDialog from '@/components/table_screen/dialogs/FlowStepDialog';
import { useJoinTable } from '@/hooks/useJoinTable';

const initialSteps = {
  signature: 'pending',
  approval: 'pending',
  transfer: 'pending',
};

export default function JoinTableFlowDialog({ request, onComplete }) {
  const { joinTableWithBuyIn } = useJoinTable();
  const startedRef = useRef(false);
  const resultRef = useRef(null);
  const [steps, setSteps] = useState(initialSteps);
  const [topUpFactor, setTopUpFactor] = useState(10);
  const [error, setError] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!request || startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      try {
        const result = await joinTableWithBuyIn({
          ...request,
          onStep: (step, status) => {
            setSteps((current) => ({ ...current, [step]: status }));
          },
        });
        resultRef.current = result;
        setIsComplete(true);
      } catch (err) {
        console.error(err);
        setError(err.shortMessage || err.details || err.message || 'Transaction failed or was rejected.');
        setSteps((current) => {
          const next = { ...current };
          const activeStep = Object.entries(next).find(([, status]) => status === 'active')?.[0];
          if (activeStep) next[activeStep] = 'error';
          return next;
        });
      }
    };

    run();
  }, [joinTableWithBuyIn, request]);

  return (
    <FlowStepDialog
      title="Joining Table"
      description="We will create your deterministic table session, approve the CHIPS buy-in if needed, then join the table on Arbitrum."
      topUpFactor={topUpFactor}
      onTopUpFactorChange={setTopUpFactor}
      error={error}
      isComplete={isComplete}
      onOk={() => onComplete?.(resultRef.current)}
      steps={[
        { id: 'signature', label: 'Signature to generate BLS', status: steps.signature },
        { id: 'approval', label: 'Approval for CHIPS transfer', status: steps.approval },
        { id: 'transfer', label: 'CHIPS transfer', status: steps.transfer },
      ]}
    />
  );
}
