import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo } from 'react';
import type { CollectionEntry } from '../../lib/types';
import CardPreview from '../card/CardPreview';

function SortableDeckCard({
  entry,
  onRemove,
}: {
  entry: CollectionEntry;
  onRemove?: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: entry.scryfallData.id,
    data: { entry },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const card = entry.scryfallData;

  return (
    <CardPreview entry={entry}>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={style}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-transparent hover:border-primary/15 hover:bg-white/[0.04] cursor-grab active:cursor-grabbing transition-colors touch-none select-none text-xs group"
      >
        <span className="flex-1 truncate text-text">{card.name}</span>
        <span className="text-[10px] text-text-muted font-mono shrink-0">CMC {card.cmc || 0}</span>
        <span
          className={`text-[10px] font-bold shrink-0 ${
            entry.scores.composite >= 70
              ? 'text-success'
              : entry.scores.composite >= 45
                ? 'text-primary'
                : 'text-danger'
          }`}
        >
          {entry.scores.composite}
        </span>
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(card.id);
            }}
            className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all shrink-0 text-xs leading-none px-1"
            aria-label="Remove"
          >
            &#10005;
          </button>
        )}
      </div>
    </CardPreview>
  );
}

interface DeckCategoryColumnProps {
  title: string;
  entries: CollectionEntry[];
  onRemove?: (id: string) => void;
}

export default function DeckCategoryColumn({ title, entries, onRemove }: DeckCategoryColumnProps) {
  const droppableId = `category-${title}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, data: { category: title } });

  const entryIds = useMemo(() => entries.map((e) => e.scryfallData.id), [entries]);

  return (
    <div
      ref={setNodeRef}
      className={`border-b border-border/30 transition-colors ${isOver ? 'bg-primary/10 border-primary/20' : ''}`}
    >
      <div className="sticky top-0 bg-white/[0.03] px-3 py-2 flex items-center justify-between z-[2] backdrop-blur-sm">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
          {title}
        </span>
        <span className="text-[10px] text-text-secondary">{entries.length}</span>
      </div>
      <div className="p-1 space-y-0.5">
        <SortableContext items={entryIds} strategy={verticalListSortingStrategy}>
          {entries.map((entry) => (
            <SortableDeckCard key={entry.scryfallData.id} entry={entry} onRemove={onRemove} />
          ))}
        </SortableContext>
        {entries.length === 0 && (
          <div className="py-3 text-[10px] text-text-muted text-center">
            Drop cards here
          </div>
        )}
      </div>
    </div>
  );
}
