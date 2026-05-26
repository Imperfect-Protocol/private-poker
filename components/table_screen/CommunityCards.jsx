import { Card } from '@/components/table_screen/Card';

export default function CommunityCards({ cards }) {
  const visibleCards = cards ?? [];

  return (
    <div className="grid w-[15rem] grid-cols-5 gap-1.5 pointer-events-auto md:w-[17rem]">
      {visibleCards.map((card, idx) => (
        card
          ? <Card key={`${card}-${idx}`} rank={card[0]} suit={card[1]} isHidden={false} size="community" />
          : <Card key={`hidden-${idx}`} isHidden size="community" />
      ))}
    </div>
  );
}
