import { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useCollectionStore } from '../../stores/collectionStore';
import { useDeckStore } from '../../stores/deckStore';
import { analyzeCommander } from '../../lib/commander-analyzer';
import { categorizeCard } from '../../lib/card-roles';
import type { CollectionEntry } from '../../lib/types';
import CardPool from './CardPool';
import DeckCategoryColumn from './DeckCategoryColumn';

const CATEGORY_ORDER = [
  'Commander',
  'Lands',
  'Ramp',
  'Card Draw',
  'Tutors',
  'Protection',
  'Board Wipes',
  'Interaction',
  'Recursion',
  'Win Cons',
  'Strategy',
  'Flex',
];

export default function DeckWorkspace() {
  const collection = useCollectionStore((s) => s.collection);
  const commander = useCollectionStore((s) => s.commander);
  const { cardIds, categoryOverrides, addCard, removeCard, setCategoryOverride, virtualEntries } = useDeckStore();

  const [activeCard, setActiveCard] = useState<CollectionEntry | null>(null);

  const { setNodeRef: poolRef } = useDroppable({ id: 'pool-zone', data: { category: null } });

  const deckEntries = useMemo(
    () => {
      const real = collection.filter((e) => cardIds.includes(e.scryfallData.id));
      const virtual = virtualEntries.filter((v) => cardIds.includes(v.scryfallData.id));
      return [...real, ...virtual];
    },
    [collection, cardIds, virtualEntries],
  );

  const cmdrEntry = useMemo(
    () => (commander ? collection.find((e) => e.scryfallData.id === commander.id) : null),
    [collection, commander],
  );

  const cmdAnalysis = useMemo(
    () => (commander ? analyzeCommander(commander) : null),
    [commander],
  );

  const categorized = useMemo(() => {
    const map = new Map<string, CollectionEntry[]>();
    for (const entry of deckEntries) {
      const cat = categorizeCard(entry, cmdAnalysis, categoryOverrides);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(entry);
    }
    return map;
  }, [deckEntries, cmdAnalysis]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = event.active.id as string;
      const entry =
        deckEntries.find((e) => e.scryfallData.id === id) ||
        collection.find((e) => e.scryfallData.id === id);
      if (entry) setActiveCard(entry);
    },
    [deckEntries, collection],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCard(null);
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as string;
      const activeData = active.data.current as { entry?: CollectionEntry; source?: string } | undefined;
      const overId = over.id as string;
      const overData = over.data.current as { category?: string } | undefined;

      const isFromPool = activeData?.source === 'pool';
      const isFromDeck = cardIds.includes(activeId);
      const targetCategory = overData?.category;

      if (isFromPool && targetCategory) {
        addCard(activeId, { role: targetCategory, reason: `Dragged to ${targetCategory}` });
        return;
      }

      if (isFromDeck && overId === 'pool-zone') {
        removeCard(activeId);
        return;
      }

      if (isFromDeck && targetCategory && overId.startsWith('category-')) {
        setCategoryOverride(activeId, targetCategory);
        return;
      }
    },
    [addCard, removeCard, cardIds],
  );

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3 lg:h-[calc(100vh-230px)] animate-[fade-in-up_0.35s_ease-out]">
        <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col shadow-[0_8px_32px_rgba(0,0,0,0.5)] max-h-[50vh] lg:max-h-none transition-shadow duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_20px_rgba(180,77,255,0.04)]">
          <div className="px-3 py-2.5 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
              Collection ({collection.length})
            </span>
          </div>
          <div ref={poolRef} className="flex-1 overflow-y-auto">
            <CardPool />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_20px_rgba(255,170,0,0.06)] min-h-0">
          <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-gradient-to-r from-accent/5 to-primary/5 backdrop-blur-md border-b border-border/50 z-10">
            <h3 className="text-sm font-semibold text-text">Deck List</h3>
            <span className="text-sm text-text-secondary">
              <strong className="text-primary">{cardIds.length}</strong>/99
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {cmdrEntry && (
              <DeckCategoryColumn
                title="Commander"
                entries={[cmdrEntry]}
                onRemove={removeCard}
              />
            )}
            {CATEGORY_ORDER.filter((c) => c !== 'Commander').map((cat) => {
              const entries = categorized.get(cat) || [];
              return (
                <DeckCategoryColumn
                  key={cat}
                  title={cat}
                  entries={entries}
                  onRemove={removeCard}
                />
              );
            })}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div className="rounded-xl border border-primary/40 glass px-4 py-2.5 shadow-[0_0_30px_rgba(255,170,0,0.2),0_8px_25px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-3">
              <span className="text-sm text-text font-medium">{activeCard.scryfallData.name}</span>
              <span className="text-xs text-text-muted font-mono">
                CMC {activeCard.scryfallData.cmc || 0}
              </span>
              <span
                className={`text-xs font-bold ${
                  activeCard.scores.composite >= 70
                    ? 'text-success'
                    : activeCard.scores.composite >= 45
                      ? 'text-primary'
                      : 'text-danger'
                }`}
              >
                {activeCard.scores.composite}
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
