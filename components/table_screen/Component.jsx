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

const payoutClockPositions = {
  12: { left: '60%', top: '16%' },
  1: { left: '85%', top: '21%' },
  2: { left: '102%', top: '32%' },
  3: { left: '105%', top: '59%' },
  4: { left: '102%', top: '81%' },
  5: { left: '85%', top: '102%' },
  6: { left: '60%', top: '101%' },
  7: { left: '35%', top: '102%' },
  8: { left: '18%', top: '81%' },
  9: { left: '15%', top: '59%' },
  10: { left: '18%', top: '32%' },
  11: { left: '35%', top: '21%' },
};

function NextHandCountdown({ onComplete }) {
  const [seconds, setSeconds] = useState(10);
  const completedRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((value) => Math.max(value - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (seconds !== 0 || completedRef.current) return;
    completedRef.current = true;
    onComplete?.();
  }, [onComplete, seconds]);

  return `00:${String(seconds).padStart(2, '0')}`;
}

function getSeatingArrangement(numPlayers) {
  switch (numPlayers) {
    case 2: return [6, 12];
    case 3: return [6, 10, 2];
    case 4: return [6, 9, 12, 3];
    case 6: return [6, 8, 10, 12, 2, 4];
    default: return [6, 8, 10, 12, 2, 4].slice(0, numPlayers);
  }
}

function payoutPositionStyle(tableData, currentPlayerAddress, winnerSeat) {
  if (winnerSeat == null) return payoutClockPositions[12];

  const players = tableData?.players ?? [];
  const userIndex = players.findIndex(
    (player) => player.playerAddress?.toLowerCase() === currentPlayerAddress?.toLowerCase(),
  );
  const visualSeats = userIndex >= 0
    ? [
      ...players.slice(userIndex).map((_, index) => userIndex + index),
      ...players.slice(0, userIndex).map((_, index) => index),
    ]
    : players.map((_, index) => index);
  const visualIndex = visualSeats.indexOf(winnerSeat);
  const maxSeatCount = Number(tableData?.maxSeats || tableData?.max_players || players.length || 2);
  const clockSeats = getSeatingArrangement(maxSeatCount);

  return payoutClockPositions[clockSeats[visualIndex]] ?? payoutClockPositions[12];
}

export default function TableScreen({
  tableData,
  currentPlayerAddress,
  playerNetworkStates = {},
  showActionBar = false,
  actionBarProps = {},
  gameState = null,
  debugConsole = null,
  onNextHandCountdownComplete,
  getPlayerDisplayname = null,
  webcam = null,
  children,
}) {
  const hasDimOverlay = Children.toArray(children).length > 0;
  const communityCards = parseCards(tableData?.current_hand?.community_cards);
  const showResult = Boolean(gameState?.resultText);
  const showNextHandCountdown = showResult && Boolean(gameState?.canStartNextHand);
  const isCheatResult = Boolean(gameState?.cheat);
  const winnerAddress = gameState?.resultWinner == null
    ? null
    : tableData?.players?.[gameState.resultWinner]?.playerAddress;
  const winnerLabel = winnerAddress
    ? getPlayerDisplayname?.(winnerAddress) || winnerAddress.slice(2, 4).toUpperCase()
    : null;
  const resultTitleText = !isCheatResult && gameState?.resultText !== 'You Win'
    ? `${winnerLabel ?? 'Winner'} Wins`
    : gameState?.resultText;
  const resultRankText = gameState?.resultRank
    ? gameState.resultText === 'You Win'
      ? gameState.resultRank
      : `${winnerLabel ?? 'Winner'} Wins With ${gameState.resultRank}`
    : isCheatResult
      ? gameState.cheat.isViewerCheater
        ? `Cheated ${gameState.cheat.kind}`
        : `${(
          getPlayerDisplayname?.(tableData?.players?.[gameState.cheat.player]?.playerAddress)
          || tableData?.players?.[gameState.cheat.player]?.playerAddress?.slice(2, 4)
          || 'Player'
        ).toUpperCase()} Cheated ${gameState.cheat.kind}`
      : null;
  const resultColorClass = isCheatResult
    ? gameState.cheat.isViewerCheater ? 'text-red-300' : 'text-purple-300'
    : gameState?.resultText === 'You Win'
      ? 'text-yellow-200 drop-shadow-[0_0_28px_rgba(250,204,21,0.95)]'
      : 'text-orange-500 drop-shadow-[0_0_28px_rgba(249,115,22,0.9)]';
  const payoutStyle = payoutPositionStyle(tableData, currentPlayerAddress, gameState?.payout?.winner);

  return (
    <main className="min-h-screen bg-slate-950 p-4 md:px-4 md:py-4 text-white relative flex flex-col">
      <Title
        tableName={tableData.name}
        rightText={showNextHandCountdown ? (
          <NextHandCountdown onComplete={onNextHandCountdownComplete} />
        ) : null}
      />

      <div className="flex-1 flex items-center justify-center relative">
        <div className="relative w-full bottom-28 max-w-4xl aspect-[16/9] mx-auto mt-20 mb-0">
          <Background />

          {showResult && (
            <div className="absolute left-1/2 top-[-36%] z-30 -translate-x-1/2 pointer-events-none">
              <div className={`text-center text-4xl md:text-6xl font-black uppercase tracking-widest italic ${isCheatResult ? 'drop-shadow-[0_0_28px_rgba(255,255,255,0.3)]' : ''} ${resultColorClass}`}>
                {resultTitleText}
              </div>
              {resultRankText && (
                <div className={`mt-2 text-center text-sm md:text-base font-black uppercase tracking-[0.25em] drop-shadow-[0_0_18px_rgba(20,184,166,0.35)] ${isCheatResult ? resultColorClass : 'text-white'}`}>
                  {resultRankText}
                </div>
              )}
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="grid grid-cols-[10rem_22rem] items-center gap-4">
              <div className="text-center group pointer-events-auto">
              <div className="bg-[#080d16]/95 border-2 border-[#435064]/85 px-8 py-3 rounded-2xl backdrop-blur-xl shadow-[0_10px_24px_rgba(0,0,0,0.3),inset_0_0_18px_rgba(96,116,145,0.14)]">
                <p className="text-[10px] text-[#94a3b8] font-mono tracking-widest uppercase mb-1">Current Pot</p>
                <div className="flex items-center justify-center gap-2 text-white">
                  <Coins size={28} className="text-yellow-200 drop-shadow-[0_0_10px_rgba(250,204,21,0.35)]" />
                  <p className="text-3xl font-black font-mono tracking-tighter italic">
                    {tableData?.current_hand?.current_pot || tableData?.total_buyin || "0"}
                  </p>
                </div>
              </div>
              </div>
              <CommunityCards cards={communityCards} />
            </div>
          </div>

          <TablePlayers
            tableData={tableData}
            currentPlayerAddress={currentPlayerAddress}
            playerNetworkStates={playerNetworkStates}
            gameState={gameState}
            getPlayerDisplayname={getPlayerDisplayname}
            webcamStream={webcam?.stream ?? null}
            remoteWebcamStreams={webcam?.remoteStreams ?? {}}
            isWebcamStarting={Boolean(webcam?.isStarting)}
            onToggleWebcam={webcam?.toggle ?? null}
            isAudioEnabled={Boolean(webcam?.isAudioEnabled)}
            isAudioStarting={Boolean(webcam?.isAudioStarting)}
            onToggleAudio={webcam?.toggleAudio ?? null}
          />

          {gameState?.payout && (
            <div className="absolute inset-0 z-20 pointer-events-none">
              <div
                className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-yellow-300/40 bg-slate-950/85 px-4 py-2 text-yellow-200 shadow-[0_0_28px_rgba(250,204,21,0.35)] animate-[payoutPulse_1.8s_ease-in-out_infinite]"
                style={payoutStyle}
              >
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
