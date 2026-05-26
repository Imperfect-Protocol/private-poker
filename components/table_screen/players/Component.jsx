import Player from '@/components/table_screen/players/Player';
import { parseCards } from '@/components/table_screen/Card';

const clockPositions = {
  12: "top-0 left-1/2 -translate-x-1/2",
  1: "top-0 left-4/6 -translate-x-1/2",
  2: "top-2/9 left-4/5 -translate-y-1/2",
  3: "top-5/9 left-7/8 -translate-y-1/2",
  4: "top-7/8 left-4/5 -translate-y-1/2",
  5: "top-7/9 left-5/8 -translate-y-1/2",
  6: "top-7/9 left-1/2 -translate-x-1/2",
  7: "top-7/9 left-2/6 -translate-x-1/2",
  8: "top-7/8 left-1/12 -translate-y-1/2",
  9: "top-5/9 left-0 -translate-y-1/2",
  10: "top-2/9 left-1/12 -translate-y-1/2",
  11: "top-0 left-2/6 -translate-x-1/2",
};

function getSeatingArrangement(numPlayers) {
  switch (numPlayers) {
    case 2: return [6, 12];
    case 3: return [6, 10, 2];
    case 4: return [6, 9, 12, 3];
    case 6: return [6, 8, 10, 12, 2, 4];
    default: return [6, 8, 10, 12, 2, 4].slice(0, numPlayers);
  }
}

function getSeatedPlayers(tableData, currentPlayerAddress) {
  const players = tableData?.players || [];
  const userIndex = players.findIndex(
    (player) => player.playerAddress?.toLowerCase() === currentPlayerAddress?.toLowerCase(),
  );
  const rotatedPlayers = userIndex >= 0
    ? [
      ...players.slice(userIndex),
      ...players.slice(0, userIndex),
    ]
    : players;

  const maxSeatCount = Number(tableData?.maxSeats || tableData?.max_players || 0);
  if (maxSeatCount <= rotatedPlayers.length) return rotatedPlayers;

  return [
    ...rotatedPlayers,
    ...Array.from({ length: maxSeatCount - rotatedPlayers.length }, (_, index) => ({
      isEmptySeat: true,
      seatId: `empty-${index}`,
    })),
  ];
}

export default function TablePlayers({
  tableData,
  currentPlayerAddress,
  playerNetworkStates = {},
  gameState = null,
  getPlayerDisplayname = null,
  webcamStream = null,
  remoteWebcamStreams = {},
  isWebcamStarting = false,
  onToggleWebcam = null,
  isAudioEnabled = false,
  isAudioStarting = false,
  onToggleAudio = null,
}) {
  const seatedPlayers = getSeatedPlayers(tableData, currentPlayerAddress);
  const activeSeats = getSeatingArrangement(seatedPlayers.length);
  const playerCardsBySeat = tableData?.current_hand?.player_cards_by_seat ?? {};
  const ownPlayerCards = parseCards(tableData?.current_hand?.own_player_cards);

  return seatedPlayers.map((player, index) => {
    const isEmptySeat = Boolean(player.isEmptySeat);
    const isMe = !isEmptySeat && player.playerAddress?.toLowerCase() === currentPlayerAddress?.toLowerCase();
    const networkState = isEmptySeat
      ? 'sitting-out'
      : playerNetworkStates[player.playerAddress?.toLowerCase()] ?? 'sitting-out';
    const originalIndex = isEmptySeat
      ? -1
      : tableData.players.findIndex((candidate) => (
        candidate.playerAddress?.toLowerCase() === player.playerAddress?.toLowerCase()
      ));
    const isTheirTurn = !isEmptySeat && tableData.current_hand?.current_player === originalIndex.toString();
    const seatCards = isMe && ownPlayerCards.length > 0
      ? ownPlayerCards
      : playerCardsBySeat[originalIndex] != null
        ? parseCards(playerCardsBySeat[originalIndex])
        : [];
    const showdownHand = gameState?.hands?.[originalIndex] ?? null;
    const handRank = showdownHand?.rank ?? null;
    const isWinner = Boolean(showdownHand?.isWinner);
    const chipStack = gameState?.chipStacks?.[originalIndex] ?? player.chips ?? null;
    const chipStackSize = gameState?.chipStackSizes?.[originalIndex] ?? null;
    const displayName = isEmptySeat
      ? ''
      : getPlayerDisplayname?.(player.playerAddress) ?? player.displayName;
    const remoteWebcamStream = isEmptySeat
      ? null
      : remoteWebcamStreams[player.playerAddress?.toLowerCase?.()] ?? null;

    return (
      <Player
        key={isEmptySeat ? player.seatId : player.playerAddress}
        player={{ ...player, displayName }}
        positionClass={clockPositions[activeSeats[index]]}
        isMe={isMe}
        isEmptySeat={isEmptySeat}
        isTheirTurn={isTheirTurn}
        networkState={networkState}
        seatCards={seatCards}
        handRank={handRank}
        isWinner={isWinner}
        chipStack={chipStack}
        chipStackSize={chipStackSize}
        webcamStream={isMe ? webcamStream : remoteWebcamStream}
        isWebcamStarting={isMe && isWebcamStarting}
        onToggleWebcam={isMe ? onToggleWebcam : null}
        isAudioEnabled={isMe && isAudioEnabled}
        isAudioStarting={isMe && isAudioStarting}
        onToggleAudio={isMe ? onToggleAudio : null}
      />
    );
  });
}
