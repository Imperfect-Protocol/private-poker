import { Card } from '@/components/table_screen/Card';
import Avatar from '@/components/table_screen/players/Avatar';
import Name from '@/components/table_screen/players/Name';
import Status from '@/components/table_screen/players/Status';
import { Coins } from 'lucide-react';

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
  chipStackSize = null,
}) {
  return (
    <div className={`absolute ${positionClass} transition-all duration-700 ease-in-out z-20`}>
      <div className="flex flex-col items-center group relative">
        {!isEmptySeat && (
          <div className={`absolute flex gap-1 z-0 ${isMe ? '-top-12 md:-top-16' : '-top-6'}`}>
            {seatCards.length > 0 ? (
              seatCards.map((card, idx) => (
                <Card key={`${card}-${idx}`} rank={card[0]} suit={card[1]} isHidden={false} size="lg" />
              ))
            ) : (
              <>
                <Card isHidden size="sm" />
                <Card isHidden size="sm" />
              </>
            )}
          </div>
        )}

        <Avatar
          player={player}
          isMe={isMe}
          isEmptySeat={isEmptySeat}
          isTheirTurn={isTheirTurn || isWinner}
        />

        {!isEmptySeat && chipStack != null && (
          <div className="absolute left-[calc(50%+1.5rem)] top-3 z-20 flex items-center gap-1 rounded-full border border-yellow-300/30 bg-slate-950/90 px-2 py-1 text-[10px] font-black text-yellow-200 shadow-[0_0_14px_rgba(250,204,21,0.25)] backdrop-blur-md">
            <Coins size={12} />
            <span className="font-mono">{chipStack}</span>
            {chipStackSize && (
              <span className="text-[8px] uppercase tracking-widest text-yellow-100/70">
                {chipStackSize}
              </span>
            )}
          </div>
        )}

        <div className={`mt-3 bg-slate-900/95 border px-4 py-1.5 rounded-lg shadow-xl min-w-[110px] backdrop-blur-sm text-center z-10 ${isEmptySeat ? 'border-slate-700/60' : isWinner ? 'border-emerald-300/80 shadow-[0_0_24px_rgba(110,231,183,0.35)]' : 'border-teal-500/30'}`}>
          <Name player={player} isEmptySeat={isEmptySeat} />
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
