import Player from '@/components/table_screen/players/Player';
import { parseCards } from '@/components/table_screen/Card';

const clockPositions = {
  12: "top-[-5%] left-1/2 -translate-x-1/2",
  1: "top-[5%] left-[75%] -translate-x-1/2",
  2: "top-[20%] left-[92%] -translate-y-1/2",
  3: "top-1/2 left-[95%] -translate-y-1/2",
  4: "bottom-[20%] left-[92%] -translate-y-1/2",
  5: "bottom-[5%] left-[75%] -translate-x-1/2",
  6: "bottom-[-5%] left-1/2 -translate-x-1/2",
  7: "bottom-[5%] left-[25%] -translate-x-1/2",
  8: "bottom-[20%] left-[8%] -translate-y-1/2",
  9: "top-1/2 left-[5%] -translate-y-1/2",
  10: "top-[20%] left-[8%] -translate-y-1/2",
  11: "top-[5%] left-[25%] -translate-x-1/2",
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

function getSeatedPlayers(tableData, currentBuyinAddress) {
  const players = tableData?.players || [];
  const userIndex = players.findIndex(
    (player) => player.buyinAddress?.toLowerCase() === currentBuyinAddress?.toLowerCase(),
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
  currentBuyinAddress,
}) {
  const seatedPlayers = getSeatedPlayers(tableData, currentBuyinAddress);
  const activeSeats = getSeatingArrangement(seatedPlayers.length);
  const heroCards = parseCards(tableData?.current_hand?.player_cards);

  return seatedPlayers.map((player, index) => {
    const isEmptySeat = Boolean(player.isEmptySeat);
    const isMe = !isEmptySeat && player.buyinAddress?.toLowerCase() === currentBuyinAddress?.toLowerCase();
    const originalIndex = isEmptySeat ? -1 : tableData.players.findIndex((candidate) => candidate.buyinAddress === player.buyinAddress);
    const isTheirTurn = !isEmptySeat && tableData.current_hand?.current_player === originalIndex.toString();

    return (
      <Player
        key={isEmptySeat ? player.seatId : player.buyinAddress}
        player={player}
        positionClass={clockPositions[activeSeats[index]]}
        isMe={isMe}
        isEmptySeat={isEmptySeat}
        isTheirTurn={isTheirTurn}
        heroCards={heroCards}
      />
    );
  });
}
