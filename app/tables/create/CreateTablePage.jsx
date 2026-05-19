"use client";

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConnection } from 'wagmi';
import CreateTableDialog from '@/components/table_screen/dialogs/CreateTableDialog';
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

function CreateTableComposer() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { address } = useConnection();

  const lobbyId = searchParams.get('lobbyId') || "1";
  const [previewName, setPreviewName] = useState("New Player Table");
  const [createdTableData, setCreatedTableData] = useState(null);
  const [hasJoinedTable, setHasJoinedTable] = useState(false);
  const isCreatingTable = !createdTableData;
  const tableData = makePreviewTable(previewName, createdTableData);

  const handleCreated = ({ tableData: nextTableData, tableId, lobbyId: nextLobbyId }) => {
    setCreatedTableData(nextTableData);
    setHasJoinedTable(true);
    window.sessionStorage.setItem(
      `private-poker:new-table:${tableId}`,
      JSON.stringify({ tableData: nextTableData, isSeated: true }),
    );
    router.push(`/tables/${tableId}?lobbyId=${nextLobbyId}`);
  };

  return (
    <TableScreen
      tableData={tableData}
      currentUserAddress={address}
    >
      {!hasJoinedTable && isCreatingTable && (
        <CreateTableDialog
          lobbyId={lobbyId}
          currentUserAddress={address}
          onPreviewNameChange={setPreviewName}
          onCreated={handleCreated}
          onCancel={() => window.close()}
        />
      )}
    </TableScreen>
  );
}

export default function CreateTablePage() {
  return (
    <div className="min-h-screen bg-slate-950 relative">
      <Suspense fallback={
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="w-full max-w-lg text-center py-16 text-teal-600/50 font-mono text-xs uppercase tracking-widest border border-dashed border-teal-500/20 rounded-xl bg-slate-900/30">
            Loading Data Terminal...
          </div>
        </div>
      }>
        <CreateTableComposer />
      </Suspense>
    </div>
  );
}
