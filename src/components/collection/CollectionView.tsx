import { useState, useMemo, useRef } from 'react';
import { Library } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCollectionStore } from '../../stores/collectionStore';
import { useDeckStore } from '../../stores/deckStore';
import { useToastStore } from '../../stores/toastStore';
import CommanderSelector from './CommanderSelector';
import type { CollectionEntry } from '../../lib/types';
import { getColorIdentity, isLegendaryCreature } from '../../lib/card-utils';
import { getCardImageUrl } from '../../lib/scryfall';
import CardPreview from '../card/CardPreview';

type SortKey = 'composite' | 'power' | 'synergy' | 'mana' | 'wincon' | 'budget' | 'name' | 'cmc';

export default function CollectionView() {
  const collection = useCollectionStore((s) => s.collection);
  const commander = useCollectionStore((s) => s.commander);

  const [search, setSearch] = useState('');
  const [filterColor, setFilterColor] = useState('');
  const [filterType, setFilterType] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let items = [...collection];

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (e) =>
          (e.scryfallData.name || '').toLowerCase().includes(q) ||
          (e.scryfallData.type_line || '').toLowerCase().includes(q) ||
          (e.scryfallData.oracle_text || '').toLowerCase().includes(q),
      );
    }

    if (filterColor) {
      items = items.filter((e) => {
        const ci = getColorIdentity(e.scryfallData);
        if (filterColor === 'multi') return ci.length > 1;
        if (filterColor === 'C') return ci.length === 0;
        return ci.includes(filterColor);
      });
    }

    if (filterType) {
      items = items.filter((e) =>
        (e.scryfallData.type_line || '').toLowerCase().includes(filterType.toLowerCase()),
      );
    }

    items.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (sortKey) {
        case 'composite':
          va = a.scores.composite;
          vb = b.scores.composite;
          break;
        case 'power':
          va = a.scores.power;
          vb = b.scores.power;
          break;
        case 'synergy':
          va = a.scores.cmdSynergy;
          vb = b.scores.cmdSynergy;
          break;
        case 'mana':
          va = a.scores.manaEff;
          vb = b.scores.manaEff;
          break;
        case 'wincon':
          va = a.scores.winCon;
          vb = b.scores.winCon;
          break;
        case 'budget':
          va = a.scores.budget;
          vb = b.scores.budget;
          break;
        case 'name':
          va = (a.scryfallData.name || '').toLowerCase();
          vb = (b.scryfallData.name || '').toLowerCase();
          break;
        case 'cmc':
          va = a.scryfallData.cmc || 0;
          vb = b.scryfallData.cmc || 0;
          break;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return items;
  }, [collection, search, filterColor, filterType, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  const getScoreClass = (v: number) => {
    if (v >= 7) return 'bg-success/15 text-success';
    if (v >= 4) return 'bg-primary/15 text-primary';
    return 'bg-danger/15 text-danger';
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 38,
    overscan: 10,
  });

  if (!collection.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Library size={64} className="text-text-secondary/30 mb-4" />
        <h2 className="text-xl font-semibold text-text mb-2">No Collection Loaded</h2>
        <p className="text-text-secondary text-sm max-w-md">
          Go to the Import tab, upload a ManaBox CSV, and your collection will appear here
          with search, filters, and scoring for deck building.
        </p>
      </div>
    );
  }

  const commanderCI = commander
    ? getColorIdentity(commander).map((c) => c.toUpperCase())
    : null;

  return (
    <div className="space-y-4">
      <CommanderSelector />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-black/[0.03] border border-border rounded-lg text-text px-3 py-2 text-sm focus:outline-none focus:border-[#c9a84c] placeholder:text-text-muted"
          />
        </div>

        <select
          value={filterColor}
          onChange={(e) => setFilterColor(e.target.value)}
          className="bg-black/[0.03] border border-border rounded-lg text-text-secondary px-3 py-2 text-sm focus:outline-none focus:border-[#c9a84c]"
        >
          <option value="">All Colors</option>
          <option value="W">White</option>
          <option value="U">Blue</option>
          <option value="B">Black</option>
          <option value="R">Red</option>
          <option value="G">Green</option>
          <option value="multi">Multicolor</option>
          <option value="C">Colorless</option>
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-black/[0.03] border border-border rounded-lg text-text-secondary px-3 py-2 text-sm focus:outline-none focus:border-[#c9a84c]"
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

        <button
          onClick={() => {
            setSearch('');
            setFilterColor('');
            setFilterType('');
          }}
          className="text-xs text-text-muted hover:text-text transition-colors px-3 py-2"
        >
          Reset
        </button>
      </div>

      <div className="text-xs text-text-muted">
        Showing {filtered.length} of {collection.length} cards
      </div>

      <div ref={scrollRef} className="rounded-2xl border border-border bg-card shadow-sm overflow-auto max-h-[calc(100vh-320px)] shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-card-elevated">
              <th
                className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary cursor-pointer hover:text-primary transition-colors select-none"
                onClick={() => handleSort('name')}
              >
                Name{getSortIndicator('name')}
              </th>
              <th
                className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary cursor-pointer hover:text-primary transition-colors select-none"
                onClick={() => handleSort('cmc')}
              >
                CMC{getSortIndicator('cmc')}
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Type
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Colors
              </th>
              <th
                className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary cursor-pointer hover:text-primary transition-colors select-none"
                onClick={() => handleSort('composite')}
              >
                Score{getSortIndicator('composite')}
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Price
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Qty
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
              <td colSpan={8} style={{ padding: 0, border: 0 }}>
                <div style={{ position: 'relative' }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const entry = filtered[virtualRow.index];
                    const card = entry.scryfallData;
                    const s = entry.scores;
                    const isSelected = selectedId === card.id;
                    const price = parseFloat(entry.csvRow.purchasePrice || '0') || 0;
                    const ci = getColorIdentity(card);
                    const typeShort = (card.type_line || '').replace(/\u2014.*$/, '').trim();
                    const isLegend = isLegendaryCreature(card);
                    return (
                      <CardPreview key={card.id} entry={entry}>
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <div
                            className={`flex border-b border-border/30 cursor-pointer transition-colors ${
                              isSelected ? 'bg-primary/10' : 'hover:bg-black/[0.03]'
                            }`}
                            onClick={() => setSelectedId(isSelected ? null : card.id)}
                          >
                            <div style={{ width: '35%' }} className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium text-[13px] truncate ${isLegend ? 'text-primary' : 'text-text'}`}>
                                  {card.name}
                                </span>
                              </div>
                            </div>
                            <div style={{ width: '6%' }} className="px-3 py-2 text-text-secondary text-xs">{card.cmc || 0}</div>
                            <div style={{ width: '16%' }} className="px-3 py-2 text-text-secondary text-xs truncate">{typeShort}</div>
                            <div style={{ width: '10%' }} className="px-3 py-2">
                              <div className="flex gap-1">
                                {ci.length === 0 && (
                                  <span className="w-4 h-4 rounded-full bg-[#b0a890] border border-black/30 flex items-center justify-center text-[8px] font-bold text-[#333]">C</span>
                                )}
                                {ci.map((c) => (
                                  <span key={c} className="w-4 h-4 rounded-full border border-black/30 flex items-center justify-center text-[8px] font-bold"
                                    style={{ background: c==='W'?'#f9f6ee':c==='U'?'#4a90d9':c==='B'?'#8b52a0':c==='R'?'#d94a4a':c==='G'?'#2d8b4a':'#555', color: ['W'].includes(c)?'#333':'#fff' }}>
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div style={{ width: '9%' }} className="px-3 py-2">
                              <span className={`inline-flex items-center justify-center min-w-[28px] h-5 rounded-full text-[11px] font-bold px-1.5 ${getScoreClass(s.composite || 0)}`}>
                                {s.composite || 0}
                              </span>
                            </div>
                            <div style={{ width: '8%' }} className="px-3 py-2 text-text-secondary text-xs">
                              {price > 0 ? `$${price.toFixed(2)}` : '\u2014'}
                            </div>
                            <div style={{ width: '6%' }} className="px-3 py-2 text-text-secondary text-xs">
                              {parseInt(entry.csvRow.quantity || '1', 10)}
                            </div>
                            <div style={{ width: '10%' }} className="px-3 py-2">
                              {commanderCI && !s.valid && (
                                <span className="text-[10px] text-danger bg-[#e05252]/10 px-2 py-0.5 rounded-full">
                                  Invalid
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardPreview>
                    );
                  })}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {selectedId && (
        <CardDetailPanel
          entry={collection.find((e) => e.scryfallData.id === selectedId)!}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function CardDetailPanel({
  entry,
  onClose,
}: {
  entry: CollectionEntry;
  onClose: () => void;
}) {
  const card = entry.scryfallData;
  const s = entry.scores;
  const price = parseFloat(entry.csvRow.purchasePrice || '0') || 0;
  const imgUrl = getCardImageUrl(card, 'normal');
  const { cardIds, addCard, removeCard } = useDeckStore();
  const addToast = useToastStore((s) => s.addToast);
  const inDeck = cardIds.includes(card.id);
  const commander = useCollectionStore((c) => c.commander);

  const scoreItems = [
    { key: 'power', label: 'Power', val: s.power, reasons: s.reasons?.power || [], color: '#e08052' },
    { key: 'cmdSynergy', label: 'Synergy', val: s.cmdSynergy, reasons: s.reasons?.cmdSynergy || [], color: '#4a90d9' },
    { key: 'manaEff', label: 'Mana Eff', val: s.manaEff, reasons: s.reasons?.manaEff || [], color: '#52c272' },
    { key: 'winCon', label: 'Win Con', val: s.winCon, reasons: s.reasons?.winCon || [], color: '#c9a84c' },
    { key: 'budget', label: 'Budget', val: s.budget, reasons: s.reasons?.budget || [], color: '#9052e0' },
  ];

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[380px] bg-card border-l border-border z-50 flex flex-col shadow-[-8px_0_40px_rgba(0,0,0,0.6)] overflow-y-auto">
      <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-card-elevated border-b border-border z-10">
        <h3 className="text-sm font-semibold text-primary truncate pr-2">{card.name}</h3>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-hover flex items-center justify-center text-text-secondary hover:bg-danger hover:text-white transition-colors shrink-0"
        >
          &#10005;
        </button>
      </div>

      <div className="p-4">
        {/* Card image */}
        <div className="flex justify-center mb-4">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={card.name}
              className="rounded-xl shadow-2xl max-w-[200px]"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-[200px] h-[280px] rounded-xl bg-card border border-border flex items-center justify-center text-text-muted text-xs">
              No Image
            </div>
          )}
        </div>

        {/* Name and type */}
        <p className="text-xs text-text-muted mb-1">{card.type_line}</p>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-text-secondary">
            CMC {card.cmc || 0}
            {card.mana_cost && <span className="text-text-muted font-mono ml-2">{card.mana_cost.replace(/[{}]/g, '')}</span>}
          </span>
        </div>

        {/* Composite Score */}
        <div className="rounded-xl bg-card border border-border/50 p-4 text-center mb-4">
          <div
            className={`text-3xl font-black ${
              s.composite >= 70 ? 'text-success' : s.composite >= 45 ? 'text-primary' : 'text-danger'
            }`}
          >
            {s.composite}
          </div>
          <div className="text-[10px] text-text-muted uppercase tracking-[0.06em] mt-1">Composite Score / 100</div>
        </div>

        {/* Score Breakdown */}
        <div className="space-y-2.5 mb-4">
          {scoreItems.map((item) => (
            <div key={item.key} className="rounded-lg bg-card border border-border/30 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-secondary">
                  {item.label}
                </span>
                <span className="text-sm font-bold" style={{ color: item.color }}>
                  {item.val}/10
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-black/[0.04] overflow-hidden mb-2">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${item.val * 10}%`, background: item.color }}
                />
              </div>
              <p className="text-[10px] text-text-muted leading-relaxed">
                {(item.key === 'budget'
                  ? [...item.reasons, 'Budget score shown for reference — does not affect deck selection']
                  : item.reasons.length ? item.reasons : ['No data']
                ).join(' • ')}
              </p>
            </div>
          ))}
        </div>

        {/* Oracle text */}
        {card.oracle_text && (
          <div className="rounded-lg bg-card border border-border/30 p-3 mb-4">
            <p className="text-xs text-text-secondary leading-relaxed italic whitespace-pre-wrap">
              {card.oracle_text}
            </p>
          </div>
        )}

        {/* Meta */}
        <div className="flex flex-col gap-1 text-[10px] text-text-muted mb-4">
          <span><strong className="text-text-secondary">Set:</strong> {card.set_name} ({card.collector_number})</span>
          <span><strong className="text-text-secondary">Rarity:</strong> {card.rarity}</span>
          <span><strong className="text-text-secondary">Price:</strong> {price > 0 ? `$${price.toFixed(2)}` : '\u2014'}</span>
          <span><strong className="text-text-secondary">Quantity:</strong> {entry.csvRow.quantity || '1'}</span>
          {inDeck && <span className="text-success">&#10003; In your deck</span>}
          {!s.valid && commander && <span className="text-danger">&#10005; Invalid for this commander</span>}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {inDeck ? (
            <button
              onClick={() => { removeCard(card.id); addToast(`Removed ${card.name}`, 'info'); }}
              className="flex-1 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs font-medium hover:bg-danger/20 transition-colors"
            >
              Remove from Deck
            </button>
          ) : (
            <button
              onClick={() => { addCard(card.id, { role: 'Manual', reason: 'Added from collection' }); addToast(`Added ${card.name}`, 'success'); }}
              disabled={!s.valid || cardIds.length >= 99}
              className="flex-1 px-3 py-2 rounded-lg bg-success/10 border border-success/20 text-success text-xs font-medium hover:bg-[#52c272]/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Add to Deck
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
