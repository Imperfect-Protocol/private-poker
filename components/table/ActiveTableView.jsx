"use client";

import TableScreen from '@/components/table_screen/Component';

export default function ActiveTableView({ table, debugConsole, children }) {
  return (
    <TableScreen
      tableData={table.tableData}
      currentUserAddress={table.onPlayer.address}
      currentUserBlsKey={table.blsKeys}
      currentUserNetworkJoined={table.currentUserNetworkJoined}
      currentUserNetworkStatus={table.networkStatus}
      connectedPeerAddresses={table.connectedPeerAddresses}
      isJoiningNetwork={table.onPlayer.isGenerating}
      onJoinNetwork={() => table.onPlayer.joinNetwork({ force: true })}
      status={table.networkStatus}
      expectedPeerCount={table.expectedPeerCount}
      connectedPeerCount={table.connectedPeerCount}
      topologyLabel={table.topologyLabel}
      debugConsole={debugConsole}
      showActionBar={table.tableData !== undefined}
      actionBarProps={{}}
    >
      {children}
    </TableScreen>
  );
}
