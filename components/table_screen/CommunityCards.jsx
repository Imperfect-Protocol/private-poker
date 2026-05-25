import { Card } from '@/components/table_screen/Card';

export default function CommunityCards({ cards }) {
  if (!cards?.length) return null;

  return (
    <div className="flex gap-2 mb-6 pointer-events-auto">
      {cards.map((card, idx) => (
        card
          ? <Card key={`${card}-${idx}`} rank={card[0]} suit={card[1]} isHidden={false} size="lg" />
          : <Card key={`hidden-${idx}`} isHidden size="lg" />
      ))}
    </div>
  );
}
