import { Card } from '@/components/table_screen/Card';

export default function CommunityCards({ cards }) {
  const visibleCards = cards ?? [];

  return (
    <div className="grid w-[22rem] grid-cols-5 gap-2 pointer-events-auto">
      {visibleCards.map((card, idx) => (
        card
          ? <Card key={`${card}-${idx}`} rank={card[0]} suit={card[1]} isHidden={false} size="lg" />
          : <Card key={`hidden-${idx}`} isHidden size="lg" />
      ))}
    </div>
  );
}
