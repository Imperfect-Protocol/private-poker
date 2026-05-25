"use client";

import TableScreen from '@/components/table_screen/Component';

export default function ActiveTableView({
  table,
  debugConsole,
  actionBarProps = {},
  gameState = null,
  onNextHandCountdownComplete,
  children,
}) {
  const currentSeat = table.currentSeat ?? {};

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
    >
      {children}
    </TableScreen>
  );
}
