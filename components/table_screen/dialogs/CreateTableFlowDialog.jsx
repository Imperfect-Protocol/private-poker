"use client";

import { useEffect, useRef, useState } from 'react';
import FlowStepDialog from '@/components/table_screen/dialogs/FlowStepDialog';
import { useCreateTable } from '@/hooks/useCreateTable';

const initialSteps = {
  signature: 'pending',
  operatorApproval: 'pending',
  transfer: 'pending',
};

export default function CreateTableFlowDialog({ request, onComplete, onOperatorTopUp }) {
  const { createTableWithBuyIn } = useCreateTable({ onOperatorTopUp });
  const startedRef = useRef(false);
  const resultRef = useRef(null);
  const [steps, setSteps] = useState(initialSteps);
  const [error, setError] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!request || startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      try {
        const result = await createTableWithBuyIn({
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
  }, [createTableWithBuyIn, request]);

  return (
    <FlowStepDialog
      title="Creating Table"
      description="Your Player Operator will approve the CHIPS buy-in, then create the table and move the CHIPS into PrivatePoker."
      error={error}
      isComplete={isComplete}
      onOk={() => onComplete?.(resultRef.current)}
      steps={[
        { id: 'signature', label: 'Generate table BLS key', status: steps.signature },
        { id: 'operatorApproval', label: 'Operator approves CHIPS', status: steps.operatorApproval },
        { id: 'transfer', label: 'Create table and move CHIPS', status: steps.transfer },
      ]}
    />
  );
}
