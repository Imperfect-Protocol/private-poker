import { Card } from '@/components/table_screen/Card';
import Avatar from '@/components/table_screen/players/Avatar';
import Name from '@/components/table_screen/players/Name';
import Status from '@/components/table_screen/players/Status';

export default function TablePlayer({
  player,
  positionClass,
  isMe,
  isEmptySeat,
  isTheirTurn,
  networkState,
  seatCards = [],
  handRank = null,
  isWinner = false,
  chipStack = null,
  webcamStream = null,
  isWebcamStarting = false,
  onToggleWebcam = null,
}) {
  const cardSize = isMe ? 'lg' : 'md';

  return (
    <div className={`absolute ${positionClass} transition-all duration-700 ease-in-out z-20`}>
      <div className="flex flex-col items-center group relative">
        {!isEmptySeat && (
          <div className={`absolute flex gap-1 z-0 ${isMe ? '-top-12 md:-top-16' : '-top-[2.75rem] md:-top-[3.1rem]'}`}>
            {seatCards.length > 0 ? (
              seatCards.map((card, idx) => (
                card
                  ? <Card key={`${card}-${idx}`} rank={card[0]} suit={card[1]} isHidden={false} size={cardSize} />
                  : <Card key={`hidden-${idx}`} isHidden size={cardSize} />
              ))
            ) : (
              <>
                <Card isHidden size={cardSize} />
                <Card isHidden size={cardSize} />
              </>
            )}
          </div>
        )}

        <Avatar
          player={player}
          isMe={isMe}
          isEmptySeat={isEmptySeat}
          isTheirTurn={isTheirTurn || isWinner}
          isWinner={isWinner}
          webcamStream={webcamStream}
          isWebcamStarting={isMe && isWebcamStarting}
          onToggleWebcam={isMe ? onToggleWebcam : null}
        />

        <div className={`mt-3 bg-slate-900/95 border px-4 py-1.5 rounded-lg shadow-xl min-w-[110px] backdrop-blur-sm text-center z-10 ${isEmptySeat ? 'border-slate-700/60' : 'border-teal-500/30'}`}>
          <Name player={player} isEmptySeat={isEmptySeat} isMe={isMe} />
          {handRank && (
            <div className={`mt-1 text-[9px] font-black uppercase tracking-widest ${isWinner ? 'text-emerald-200' : 'text-slate-300'}`}>
              {isWinner ? 'Winner' : 'Showdown'}: {handRank}
            </div>
          )}
          <Status
            isEmptySeat={isEmptySeat}
            isMe={isMe}
            player={player}
            networkState={networkState}
            chipStack={chipStack}
          />
        </div>
      </div>
    </div>
  );
}
