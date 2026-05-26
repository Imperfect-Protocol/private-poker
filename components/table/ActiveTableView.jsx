"use client";

import { useMemo } from 'react';
import TableScreen from '@/components/table_screen/Component';
import { useAccounts } from '@/hooks/useAccounts';

export default function ActiveTableView({
  table,
  debugConsole,
  actionBarProps = {},
  gameState = null,
  onNextHandCountdownComplete,
  webcam = null,
  children,
}) {
  const currentSeat = table.currentSeat ?? {};
  const playerAddresses = useMemo(() => (
    table.tableData?.players?.map((player) => player.playerAddress).filter(Boolean) ?? []
  ), [table.tableData?.players]);
  const { getPlayerDisplayname } = useAccounts({ playerAddresses });

  return (
    <TableScreen
      tableData={table.tableData}
      currentPlayerAddress={currentSeat.playerAddress}
      playerNetworkStates={table.playerNetworkStates}
      debugConsole={debugConsole}
      showActionBar={table.tableData !== undefined && actionBarProps.visible === true}
      actionBarProps={actionBarProps}
      gameState={gameState}
      onNextHandCountdownComplete={onNextHandCountdownComplete}
      currentSeatNo={currentSeat.seatNo}
      getPlayerDisplayname={getPlayerDisplayname}
      webcam={webcam}
    >
      {children}
    </TableScreen>
  );
}
