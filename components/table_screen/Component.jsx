import { Children, useEffect, useRef, useState } from 'react';
import PlayerActionBar from '@/components/table_screen/player_action_bar/Component';
import Background from '@/components/table_screen/Background';
import CommunityCards from '@/components/table_screen/CommunityCards';
import { Coins } from 'lucide-react';
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
  gameState = null,
  debugConsole = null,
  onNextHandCountdownComplete,
  children,
}) {
  const hasDimOverlay = Children.toArray(children).length > 0;
  const communityCards = parseCards(tableData?.current_hand?.community_cards);
  const showResult = Boolean(gameState?.resultText);
  const showNextHandCountdown = showResult && Boolean(gameState?.canStartNextHand);
  const [nextHandCountdown, setNextHandCountdown] = useState(10);
  const countdownCompletedRef = useRef(false);

  useEffect(() => {
    if (!showNextHandCountdown) {
      setNextHandCountdown(10);
      countdownCompletedRef.current = false;
      return undefined;
    }

    setNextHandCountdown(10);
    countdownCompletedRef.current = false;
    const timer = setInterval(() => {
      setNextHandCountdown((value) => Math.max(value - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [showNextHandCountdown]);

  useEffect(() => {
    if (!showNextHandCountdown || nextHandCountdown !== 0 || countdownCompletedRef.current) return;
    countdownCompletedRef.current = true;
    onNextHandCountdownComplete?.();
  }, [nextHandCountdown, onNextHandCountdownComplete, showNextHandCountdown]);

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
            gameState={gameState}
          />

          {showResult && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
              {showNextHandCountdown && (
                <div className="absolute right-4 top-4 rounded-lg border border-teal-300/30 bg-slate-950/85 px-4 py-3 text-right shadow-[0_0_24px_rgba(20,184,166,0.25)] backdrop-blur-xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-teal-200/80">
                    Next Hand
                  </p>
                  <p className="font-mono text-3xl md:text-4xl font-black leading-none text-white">
                    {nextHandCountdown}
                  </p>
                </div>
              )}
              <div className="flex flex-col items-center gap-3">
                <div className={`text-6xl md:text-8xl font-black uppercase tracking-widest italic drop-shadow-[0_0_35px_rgba(255,255,255,0.35)] ${gameState.resultText === 'You Win' ? 'text-emerald-300' : 'text-red-300'}`}>
                  {gameState.resultText}
                </div>
                {gameState.resultRank && (
                  <div className="rounded-full border border-white/20 bg-slate-950/80 px-5 py-2 text-sm md:text-base font-black uppercase tracking-[0.35em] text-white shadow-[0_0_28px_rgba(20,184,166,0.25)] backdrop-blur-xl">
                    {gameState.resultRank}
                  </div>
                )}
              </div>
            </div>
          )}

          {gameState?.payout && (
            <div className="absolute inset-0 z-20 pointer-events-none">
              <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-yellow-300/40 bg-slate-950/85 px-4 py-2 text-yellow-200 shadow-[0_0_28px_rgba(250,204,21,0.35)] animate-[payoutPulse_1.8s_ease-in-out_infinite]">
                <Coins size={18} />
                <span className="font-mono text-sm font-black">+{gameState.payout.amount}</span>
              </div>
            </div>
          )}
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
