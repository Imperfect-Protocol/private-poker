"use client";

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CreateTableDialog from '@/components/table_screen/dialogs/CreateTableDialog';
import CreateTableFlowDialog from '@/components/table_screen/dialogs/CreateTableFlowDialog';
import TopUpOperatorGasDialog from '@/components/table_screen/dialogs/TopUpOperatorGasDialog';
import TableScreen from '@/components/table_screen/Component';

function makePreviewTable(name, tableData = null) {
  return tableData ?? {
    id: 'preview',
    name: name?.trim() || 'New Table',
    buyin: 0,
    players: [],
    current_hand: { min_bet: 10, max_bet: 100, bet_step: 10, community_cards: "" },
  };
}

export default function CreateTableScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const lobbyId = searchParams.get('lobbyId') || "1";
  const [previewName, setPreviewName] = useState("New Player Table");
  const [createdTableData, setCreatedTableData] = useState(null);
  const [hasJoinedTable, setHasJoinedTable] = useState(false);
  const [createRequest, setCreateRequest] = useState(null);
  const [topUpRequest, setTopUpRequest] = useState(null);
  const isCreatingTable = !createdTableData;
  const tableData = makePreviewTable(previewName, createdTableData);

  const handleCreated = (result) => {
    if (!createRequest || !result) return;
    const nextTableData = {
      id: createRequest.tableId,
      name: createRequest.tableName,
      buyin: createRequest.buyIn,
      maxSeats: createRequest.numPlayers,
      players: result.keys?.operator
        ? [{
          playerAddress: result.keys.playerAddress,
          operator: result.keys.operator,
          chips: createRequest.buyIn.toString(),
          annoncePublicKey: result.publicKeyBytes,
        }]
        : [],
      current_hand: { min_bet: 10, max_bet: 100, bet_step: 10, community_cards: "" },
    };
    setCreatedTableData(nextTableData);
    setHasJoinedTable(true);
    window.sessionStorage.setItem(
      `private-poker:new-table:${createRequest.tableId}`,
      JSON.stringify({ tableData: nextTableData, isSeated: true }),
    );
    router.push(`/tables/${createRequest.tableId}?lobbyId=${createRequest.lobbyId}`);
  };

  const handleOperatorTopUp = ({ operator, requiredAmount }) => {
    return new Promise((resolve) => {
      setTopUpRequest({
        operator,
        requiredAmount,
        resolve: (amount) => {
          setTopUpRequest(null);
          resolve(amount);
        },
      });
    });
  };

  return (
    <TableScreen
      tableData={tableData}
    >
      {!hasJoinedTable && isCreatingTable && !createRequest && (
        <CreateTableDialog
          lobbyId={lobbyId}
          onPreviewNameChange={setPreviewName}
          onCreateRequest={setCreateRequest}
          onCancel={() => window.close()}
        />
      )}
      {!hasJoinedTable && createRequest && (
        <CreateTableFlowDialog
          request={createRequest}
          onOperatorTopUp={handleOperatorTopUp}
          onComplete={handleCreated}
        />
      )}
      {topUpRequest && (
        <TopUpOperatorGasDialog
          operator={topUpRequest.operator}
          requiredAmount={topUpRequest.requiredAmount}
          onConfirm={topUpRequest.resolve}
        />
      )}
    </TableScreen>
  );
}
