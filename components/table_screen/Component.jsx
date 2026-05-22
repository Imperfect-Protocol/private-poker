import { Children } from 'react';
import PlayerActionBar from '@/components/table_screen/player_action_bar/Component';
import Background from '@/components/table_screen/Background';
import CommunityCards from '@/components/table_screen/CommunityCards';
import { parseCards } from '@/components/table_screen/Card';
import DebugConsole from '@/components/table_screen/DebugConsole';
import DimmOverlay from '@/components/table_screen/DimmOverlay';
import TablePlayers from '@/components/table_screen/players/Component';
import Title from '@/components/table_screen/Title';

export default function TableScreen({
  tableData,
  currentPlayerAddress,
  playerNetworkStates = {},
  showActionBar = false,
  actionBarProps = {},
  debugConsole = null,
  children,
}) {
  const hasDimOverlay = Children.toArray(children).length > 0;
  const communityCards = parseCards(tableData?.current_hand?.community_cards);

  return (
    <main className="min-h-screen bg-slate-950 p-4 md:px-4 md:py-4 text-white relative flex flex-col">
      <Title
        tableName={tableData.name}
      />

      <div className="flex-1 flex items-center justify-center relative">
        <div className="relative w-full bottom-28 max-w-4xl aspect-[16/9] mx-auto mt-20 mb-0">
          <Background />

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <CommunityCards cards={communityCards} />

            <div className="text-center group pointer-events-auto">
              <div className="bg-slate-900/90 border-2 border-teal-500/40 px-8 py-3 rounded-2xl backdrop-blur-xl shadow-[0_0_30px_rgba(20,184,166,0.2)]">
                <p className="text-[10px] text-teal-400 font-mono tracking-widest uppercase mb-1">Current Pot</p>
                <p className="text-3xl font-black text-white font-mono tracking-tighter italic">
                  {tableData?.current_hand?.current_pot || tableData?.total_buyin || "0"}
                </p>
              </div>
            </div>
          </div>

          <TablePlayers
            tableData={tableData}
            currentPlayerAddress={currentPlayerAddress}
            playerNetworkStates={playerNetworkStates}
          />
        </div>

        {debugConsole && (
          <DebugConsole {...debugConsole} />
        )}

        {showActionBar && (
          <PlayerActionBar {...actionBarProps} />
        )}

        <DimmOverlay active={hasDimOverlay} />
        {children}
      </div>
    </main>
  );
}
