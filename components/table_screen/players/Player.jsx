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
  heroCards = [],
}) {
  return (
    <div className={`absolute ${positionClass} transition-all duration-700 ease-in-out z-20`}>
      <div className="flex flex-col items-center group relative">
        {!isEmptySeat && (
          <div className={`absolute flex gap-1 z-0 ${isMe ? '-top-12 md:-top-16' : '-top-6'}`}>
            {isMe && heroCards.length > 0 ? (
              heroCards.map((card, idx) => (
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
          isTheirTurn={isTheirTurn}
        />

        <div className={`mt-3 bg-slate-900/95 border px-4 py-1.5 rounded-lg shadow-xl min-w-[110px] backdrop-blur-sm text-center z-10 ${isEmptySeat ? 'border-slate-700/60' : 'border-teal-500/30'}`}>
          <Name player={player} isEmptySeat={isEmptySeat} />
          <Status
            isEmptySeat={isEmptySeat}
            isMe={isMe}
            player={player}
          />
        </div>
      </div>
    </div>
  );
}
