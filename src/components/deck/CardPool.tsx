import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useCollectionStore } from '../../stores/collectionStore';
import { useDeckStore } from '../../stores/deckStore';
import DraggableCard from './DraggableCard';

export default function CardPool() {
  const collection = useCollectionStore((s) => s.collection);
  const commander = useCollectionStore((s) => s.commander);
  const deckCardIds = useDeckStore((s) => s.cardIds);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterColor, setFilterColor] = useState('');
  const [filterScore, setFilterScore] = useState('');

  const poolCards = useMemo(() => {
    let items = collection.filter(
      (e) => !deckCardIds.includes(e.scryfallData.id) && e.scores.valid !== false,
    );

    if (commander && commander.id) {
      items = items.filter((e) => e.scryfallData.id !== commander.id);
    }

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (e) =>
          (e.scryfallData.name || '').toLowerCase().includes(q) ||
          (e.scryfallData.type_line || '').toLowerCase().includes(q) ||
          (e.scryfallData.oracle_text || '').toLowerCase().includes(q),
      );
    }

    if (filterType) {
      items = items.filter((e) =>
        (e.scryfallData.type_line || '').toLowerCase().includes(filterType.toLowerCase()),
      );
    }

    if (filterColor) {
      items = items.filter((e) => {
        const ci = e.scryfallData.color_identity || [];
        if (filterColor === 'multi') return ci.length > 1;
        if (filterColor === 'C') return ci.length === 0;
        return ci.map((c) => c.toUpperCase()).includes(filterColor);
      });
    }

    if (filterScore) {
      const min = parseInt(filterScore);
      if (min > 0) items = items.filter((e) => e.scores.composite >= min);
    }

    return items.sort((a, b) => b.scores.composite - a.scores.composite);
  }, [collection, deckCardIds, commander, search, filterType, filterColor, filterScore]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border/50 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search collection..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-black/[0.03] border border-border rounded-lg text-text pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-primary placeholder:text-text-muted"
          />
        </div>

        <div className="flex gap-1.5">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="flex-1 bg-black/[0.03] border border-border rounded-md text-text-secondary px-1.5 py-1 text-[10px] focus:outline-none focus:border-primary"
          >
            <option value="">All Types</option>
            <option value="Creature">Creature</option>
            <option value="Instant">Instant</option>
            <option value="Sorcery">Sorcery</option>
            <option value="Enchantment">Enchantment</option>
            <option value="Artifact">Artifact</option>
            <option value="Planeswalker">Planeswalker</option>
            <option value="Land">Land</option>
          </select>

          <select
            value={filterColor}
            onChange={(e) => setFilterColor(e.target.value)}
            className="flex-1 bg-black/[0.03] border border-border rounded-md text-text-secondary px-1.5 py-1 text-[10px] focus:outline-none focus:border-primary"
          >
            <option value="">All Colors</option>
            <option value="W">W</option>
            <option value="U">U</option>
            <option value="B">B</option>
            <option value="R">R</option>
            <option value="G">G</option>
            <option value="multi">Multi</option>
            <option value="C">Colorless</option>
          </select>

          <select
            value={filterScore}
            onChange={(e) => setFilterScore(e.target.value)}
            className="flex-1 bg-black/[0.03] border border-border rounded-md text-text-secondary px-1.5 py-1 text-[10px] focus:outline-none focus:border-primary"
          >
            <option value="">All Scores</option>
            <option value="80">80+</option>
            <option value="60">60+</option>
            <option value="40">40+</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {!poolCards.length && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-xs text-text-muted">
              {collection.length
                ? (search || filterType || filterColor || filterScore)
                  ? 'No cards match your filters.'
                  : 'All valid cards are already in your deck.'
                : 'No cards available. Import a collection first.'}
            </p>
          </div>
        )}
        {poolCards.map((entry) => (
          <DraggableCard
            key={entry.scryfallData.id}
            entry={entry}
            compact
            source="pool"
          />
        ))}
      </div>

      <div className="px-3 py-2 border-t border-border/50 text-[10px] text-text-muted flex justify-between">
        <span>{poolCards.length} available</span>
        {(search || filterType || filterColor || filterScore) && (
          <button
            onClick={() => { setSearch(''); setFilterType(''); setFilterColor(''); setFilterScore(''); }}
            className="text-primary hover:text-primary-light transition-colors"
          >
            Reset filters
          </button>
        )}
      </div>
    </div>
  );
}
