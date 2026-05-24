import { useDraggable } from '@dnd-kit/core';
import type { CollectionEntry } from '../../lib/types';
import CardPreview from '../card/CardPreview';

interface DraggableCardProps {
  entry: CollectionEntry;
  compact?: boolean;
  source?: string;
}

export default function DraggableCard({ entry, compact, source }: DraggableCardProps) {
  const card = entry.scryfallData;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { entry, source },
  });

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        opacity: isDragging ? 0.4 : 1,
      }
    : { opacity: isDragging ? 0.4 : 1 };

  const scoreColor =
    entry.scores.composite >= 70
      ? 'text-success'
      : entry.scores.composite >= 45
        ? 'text-primary'
        : 'text-danger';

  const content = compact ? (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-transparent hover:border-primary/20 hover:bg-black/[0.03] cursor-grab active:cursor-grabbing transition-colors touch-none select-none text-xs"
    >
      <span className="flex-1 truncate text-text">{card.name}</span>
      <span className="text-[10px] text-text-muted font-mono shrink-0">({card.cmc || 0})</span>
      <span className={`text-[10px] font-bold shrink-0 ${scoreColor}`}>
        {entry.scores.composite}
      </span>
    </div>
  ) : (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/50 bg-black/[0.02] hover:border-primary/20 hover:bg-primary/5 cursor-grab active:cursor-grabbing transition-all touch-none select-none"
    >
      <span className="flex-1 truncate text-sm text-text">{card.name}</span>
      <span className="text-xs text-text-muted font-mono shrink-0">
        {card.mana_cost ? card.mana_cost.replace(/[{}]/g, '') : ''}
      </span>
      <span className={`text-xs font-bold shrink-0 ${scoreColor}`}>
        {entry.scores.composite}
      </span>
    </div>
  );

  return (
    <CardPreview entry={entry}>
      {content}
    </CardPreview>
  );
}
