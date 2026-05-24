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
  const { cardIds, categoryOverrides, addCard, removeCard, setCategoryOverride } = useDeckStore();

  const [activeCard, setActiveCard] = useState<CollectionEntry | null>(null);

  const { setNodeRef: poolRef } = useDroppable({ id: 'pool-zone', data: { category: null } });

  const deckEntries = useMemo(
    () => collection.filter((e) => cardIds.includes(e.scryfallData.id)),
    [collection, cardIds],
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

      // Pool → Deck category: add card
      if (isFromPool && targetCategory) {
        addCard(activeId, { role: targetCategory, reason: `Dragged to ${targetCategory}` });
        return;
      }

      // Deck → Pool zone: remove card
      if (isFromDeck && overId === 'pool-zone') {
        removeCard(activeId);
        return;
      }

      // Deck → Deck (different category): store manual category override
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
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3 lg:h-[calc(100vh-260px)]">
        <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-[#1f1f28]/90 to-[#14141c]/90 overflow-hidden flex flex-col shadow-[0_18px_36px_rgba(0,0,0,0.28)] max-h-[50vh] lg:max-h-none">
          <div className="px-3 py-2.5 border-b border-white/[0.04]">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6a6a88]">
              Collection ({collection.length})
            </span>
          </div>
          <div ref={poolRef} className="flex-1 overflow-y-auto">
            <CardPool />
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-[#1f1f28]/90 to-[#14141c]/90 overflow-hidden flex flex-col shadow-[0_18px_36px_rgba(0,0,0,0.28)] min-h-0">
          <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-[#25252d] border-b border-white/[0.04] z-10">
            <h3 className="text-sm font-semibold text-[#e8e8f0]">Deck List</h3>
            <span className="text-sm text-[#a0a0b8]">
              <strong className="text-[#c9a84c]">{deckEntries.length}</strong>/99
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
          <div className="rounded-xl border border-[#c9a84c]/40 bg-[#1e1e24] px-4 py-2.5 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#e8e8f0] font-medium">{activeCard.scryfallData.name}</span>
              <span className="text-xs text-[#6a6a88] font-mono">
                CMC {activeCard.scryfallData.cmc || 0}
              </span>
              <span
                className={`text-xs font-bold ${
                  activeCard.scores.composite >= 70
                    ? 'text-[#52c272]'
                    : activeCard.scores.composite >= 45
                      ? 'text-[#c9a84c]'
                      : 'text-[#e05252]'
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
