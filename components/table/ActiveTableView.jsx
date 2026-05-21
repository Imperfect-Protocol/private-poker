"use client";

import TableScreen from '@/components/table_screen/Component';

export default function ActiveTableView({ table, debugConsole, children }) {
  const currentSeat = table.currentSeat ?? {};

  return (
    <TableScreen
      tableData={table.tableData}
      currentPlayerAddress={currentSeat.playerAddress}
      debugConsole={debugConsole}
      showActionBar={table.tableData !== undefined}
      actionBarProps={{}}
    >
      {children}
    </TableScreen>
  );
}
