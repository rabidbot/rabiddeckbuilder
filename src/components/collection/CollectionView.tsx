import { useState, useMemo, useRef } from 'react';
import { Crown, Search, X } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCollectionStore } from '../../stores/collectionStore';
import { useDeckStore } from '../../stores/deckStore';
import { useToastStore } from '../../stores/toastStore';
import type { CollectionEntry } from '../../lib/types';
import { getColorIdentity, isLegendaryCreature } from '../../lib/card-utils';
import { getCardImageUrl } from '../../lib/scryfall';
import CardPreview from '../card/CardPreview';

type SortKey = 'composite' | 'power' | 'synergy' | 'mana' | 'wincon' | 'budget' | 'name' | 'cmc';
type ViewMode = 'commander' | 'browse';

export default function CollectionView() {
  const collection = useCollectionStore((s) => s.collection);
  const commander = useCollectionStore((s) => s.commander);
  const setCommander = useCollectionStore((s) => s.setCommander);

  const [viewMode, setViewMode] = useState<ViewMode>('commander');
  const [search, setSearch] = useState('');
  const [filterColor, setFilterColor] = useState('');
  const [filterType, setFilterType] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cmdrSearch, setCmdrSearch] = useState('');

  const legendaries = useMemo(() => {
    return collection
      .filter((e) => e.scryfallData && isLegendaryCreature(e.scryfallData))
      .sort((a, b) => (a.scryfallData.name || '').localeCompare(b.scryfallData.name || ''));
  }, [collection]);

  const filteredLegends = useMemo(() => {
    if (!cmdrSearch.trim()) return legendaries;
    const q = cmdrSearch.toLowerCase();
    return legendaries.filter((e) =>
      (e.scryfallData.name || '').toLowerCase().includes(q) ||
      (e.scryfallData.type_line || '').toLowerCase().includes(q),
    );
  }, [legendaries, cmdrSearch]);

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

  const commanderCI = commander
    ? getColorIdentity(commander).map((c) => c.toUpperCase())
    : null;

  const commanderImgUrl = commander ? getCardImageUrl(commander, 'normal') : null;

  const manaColorBg = (c: string) => {
    const map: Record<string, string> = { W: '#f9f3e4', U: '#5a9ad4', B: '#8b6a9c', R: '#d45a4a', G: '#3d8b4a', C: '#b0a48a' };
    return map[c] || '#b0a48a';
  };

  if (!collection.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Crown size={64} className="text-text-secondary/30 mb-4" />
        <h2 className="text-xl font-semibold text-text mb-2">No Collection Loaded</h2>
        <p className="text-text-secondary text-sm max-w-md">
          Go to the Import tab, upload a ManaBox CSV, then come back here to choose your commander.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex rounded-xl border border-border overflow-hidden w-fit">
        <button
          onClick={() => setViewMode('commander')}
          className={`px-5 py-2 text-sm font-semibold transition-all duration-200 ${
            viewMode === 'commander'
              ? 'bg-primary/15 text-primary shadow-[0_0_12px_rgba(255,170,0,0.15)] ring-1 ring-inset ring-primary/20'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <Crown size={14} className="inline mr-1.5 -mt-0.5" />
          Commander
        </button>
        <button
          onClick={() => setViewMode('browse')}
          className={`px-5 py-2 text-sm font-semibold transition-all duration-200 ${
            viewMode === 'browse'
              ? 'bg-primary/15 text-primary shadow-[0_0_12px_rgba(255,170,0,0.15)] ring-1 ring-inset ring-primary/20'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <Search size={14} className="inline mr-1.5 -mt-0.5" />
          Browse
        </button>
      </div>

      {/* Commander Mode */}
      {viewMode === 'commander' && (
        <div className="space-y-6 animate-[fade-in-up_0.3s_ease-out]">
          {/* Hero Commander Display */}
          <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.03] to-accent/[0.02] p-6 shadow-[0_0_30px_rgba(180,77,255,0.04),0_8px_32px_rgba(0,0,0,0.4)] hover-lift">
            {commander ? (
              <div className="flex items-start gap-6">
                <div className="shrink-0 relative group">
                  {commanderImgUrl ? (
                    <img
                      src={commanderImgUrl}
                      alt={commander.name}
                      className="w-36 rounded-xl shadow-[0_0_30px_rgba(255,170,0,0.2)] transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-36 h-[200px] rounded-xl bg-card border border-border flex items-center justify-center text-text-muted text-xs">
                      No Image
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-text-muted mb-1">Your Commander</p>
                  <h2 className="text-2xl font-bold text-text mb-2">{commander.name}</h2>
                  <p className="text-sm text-text-secondary mb-3">{commander.type_line}</p>
                  <div className="flex items-center gap-2 mb-3">
                    {(commanderCI?.length ? commanderCI : ['C']).map((c) => (
                      <span
                        key={c}
                        className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center text-[10px] font-bold shadow-[0_0_8px_rgba(0,0,0,0.3)]"
                        style={{ background: manaColorBg(c), color: ['W', 'C'].includes(c) ? '#333' : '#fff' }}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-text-muted leading-relaxed line-clamp-2">
                    {commander.oracle_text || 'No oracle text available.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Crown size={48} className="mx-auto mb-4 text-primary/40" />
                <h2 className="text-xl font-bold text-text mb-2">Choose Your Commander</h2>
                <p className="text-text-secondary text-sm max-w-md mx-auto">
                  Select a legendary creature from your collection below to begin building your deck.
                  Your commander defines your deck's colors and strategy.
                </p>
              </div>
            )}
          </div>

          {/* Search + Legendary Grid */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search commanders..."
                  value={cmdrSearch}
                  onChange={(e) => setCmdrSearch(e.target.value)}
                  className="w-full bg-white/[0.04] border border-border rounded-lg text-text pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-text-muted"
                />
                {cmdrSearch && (
                  <button
                    onClick={() => setCmdrSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <span className="text-xs text-text-muted">
                {filteredLegends.length} legendary creatures
              </span>
            </div>

            {filteredLegends.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-sm">
                No legendary creatures match "{cmdrSearch}"
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filteredLegends.map((entry) => {
                  const card = entry.scryfallData;
                  const ci = getColorIdentity(card);
                  const img = getCardImageUrl(card, 'small');
                  const isSelected = commander?.id === card.id;
                  return (
                    <button
                      key={card.id}
                      onClick={() => setCommander(card)}
                      className={`rounded-xl border p-3 text-left transition-all duration-200 hover-lift group ${
                        isSelected
                          ? 'border-primary/40 bg-primary/[0.06] ring-1 ring-primary/30 shadow-[0_0_16px_rgba(255,170,0,0.15)]'
                          : 'border-border bg-card hover:border-primary/30 hover:shadow-[0_0_12px_rgba(255,170,0,0.1)]'
                      }`}
                    >
                      <div className="flex justify-center mb-2">
                        {img ? (
                          <img
                            src={img}
                            alt={card.name}
                            className="w-20 h-28 rounded-lg object-cover shadow-lg transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-20 h-28 rounded-lg bg-card border border-border flex items-center justify-center text-text-muted text-xs">
                            ?
                          </div>
                        )}
                      </div>
                      <p className={`text-xs font-semibold truncate ${isSelected ? 'text-primary' : 'text-text'}`}>
                        {card.name}
                      </p>
                      <div className="flex gap-1 mt-1.5">
                        {(ci.length ? ci : ['C']).map((c) => (
                          <span
                            key={c}
                            className="w-4 h-4 rounded-full border border-white/10 flex items-center justify-center text-[8px] font-bold"
                            style={{ background: manaColorBg(c), color: ['W', 'C'].includes(c) ? '#333' : '#fff' }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Browse Mode */}
      {viewMode === 'browse' && (
        <div className="space-y-4 animate-[fade-in-up_0.3s_ease-out]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search cards..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white/[0.04] border border-border rounded-lg text-text px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-text-muted"
              />
            </div>

            <select
              value={filterColor}
              onChange={(e) => setFilterColor(e.target.value)}
              className="bg-white/[0.04] border border-border rounded-lg text-text-secondary px-3 py-2 text-sm focus:outline-none focus:border-primary"
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
              className="bg-white/[0.04] border border-border rounded-lg text-text-secondary px-3 py-2 text-sm focus:outline-none focus:border-primary"
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

          <div ref={scrollRef} className="rounded-2xl border border-border bg-card shadow-sm overflow-auto max-h-[calc(100vh-250px)] shadow-[0_18px_36px_rgba(0,0,0,0.28),0_0_30px_rgba(180,77,255,0.04)]">
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
                                className={`flex border-b border-border/30 cursor-pointer transition-all duration-150 ${
                                  isSelected
                                    ? 'bg-primary/10 ring-1 ring-inset ring-primary/20'
                                    : 'hover:bg-primary/[0.04] hover:shadow-[inset_4px_0_0_rgba(255,170,0,0.15)]'
                                }`}
                                onClick={() => setSelectedId(isSelected ? null : card.id)}
                              >
                                <div style={{ width: '35%' }} className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`font-medium text-[13px] truncate ${isLegend ? 'text-primary [filter:drop-shadow(0_0_3px_rgba(255,170,0,0.3))]' : 'text-text'}`}>
                                      {card.name}
                                    </span>
                                  </div>
                                </div>
                                <div style={{ width: '6%' }} className="px-3 py-2 text-text-secondary text-xs">{card.cmc || 0}</div>
                                <div style={{ width: '16%' }} className="px-3 py-2 text-text-secondary text-xs truncate">{typeShort}</div>
                                <div style={{ width: '10%' }} className="px-3 py-2">
                                  <div className="flex gap-1">
                                    {ci.length === 0 && (
                                      <span className="w-4 h-4 rounded-full bg-[#b0a890] border border-white/10 flex items-center justify-center text-[8px] font-bold text-[#333]">C</span>
                                    )}
                                    {ci.map((c) => (
                                      <span key={c} className="w-4 h-4 rounded-full border border-white/10 flex items-center justify-center text-[8px] font-bold"
                                        style={{ background: manaColorBg(c), color: ['W'].includes(c) ? '#333' : '#fff' }}>
                                        {c}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div style={{ width: '9%' }} className="px-3 py-2">
                                  <span className={`inline-flex items-center justify-center min-w-[28px] h-5 rounded-full text-[11px] font-bold px-1.5 transition-transform hover:scale-110 ${getScoreClass(s.composite || 0)}`}>
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
                                    <span className="text-[10px] text-danger bg-danger/10 px-2 py-0.5 rounded-full">
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
        </div>
      )}

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
  const collection = useCollectionStore((c) => c.collection);

  const existingNames = useMemo(
    () => new Set(cardIds.map(id => collection.find(e => e.scryfallData.id === id)?.scryfallData.name ?? id)),
    [cardIds, collection],
  );

  const isCommanderDuplicate = commander
    ? card.oracle_id === commander.oracle_id && card.id !== commander.id
    : false;

  const isNameDuplicate = !inDeck && existingNames.has(card.name);

  const scoreItems = [
    { key: 'power', label: 'Power', val: s.power, reasons: s.reasons?.power || [], color: 'var(--color-orange)' },
    { key: 'cmdSynergy', label: 'Synergy', val: s.cmdSynergy, reasons: s.reasons?.cmdSynergy || [], color: 'var(--color-info)' },
    { key: 'manaEff', label: 'Mana Eff', val: s.manaEff, reasons: s.reasons?.manaEff || [], color: 'var(--color-success)' },
    { key: 'winCon', label: 'Win Con', val: s.winCon, reasons: s.reasons?.winCon || [], color: 'var(--color-primary)' },
    { key: 'budget', label: 'Budget', val: s.budget, reasons: s.reasons?.budget || [], color: 'var(--color-purple)' },
  ];

  return (
    <div className="glass fixed right-0 top-0 bottom-0 w-[380px] z-50 flex flex-col shadow-[-8px_0_40px_rgba(0,0,0,0.7)] overflow-y-auto animate-[slide-in-right_0.3s_ease-out]">
      <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-card-elevated/90 backdrop-blur-md border-b border-border z-10">
        <h3 className="text-sm font-semibold text-primary truncate pr-2">{card.name}</h3>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-hover flex items-center justify-center text-text-secondary hover:bg-danger hover:text-white transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4">
        {/* Card image */}
        <div className="flex justify-center mb-4">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={card.name}
              className="rounded-xl shadow-[0_0_30px_rgba(255,170,0,0.2)] max-w-[200px] hover:scale-105 transition-transform duration-300"
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
        <div className="rounded-xl bg-card border border-primary/10 p-4 text-center mb-4">
          <div
            className={`text-3xl font-black ${
              s.composite >= 70
                ? 'text-success [text-shadow:0_0_10px_rgba(0,255,136,0.3)]'
                : s.composite >= 45
                  ? 'text-primary [text-shadow:0_0_10px_rgba(255,170,0,0.3)]'
                  : 'text-danger'
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
              <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden mb-2">
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
          ) : isCommanderDuplicate ? (
            <span className="flex-1 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium text-center">
              Commander
            </span>
          ) : (
            <button
              onClick={() => { addCard(card.id, { role: 'Manual', reason: 'Added from collection' }); addToast(`Added ${card.name}`, 'success'); }}
              disabled={!s.valid || cardIds.length >= 99 || isNameDuplicate}
              className="flex-1 px-3 py-2 rounded-lg bg-success/10 border border-success/20 text-success text-xs font-medium hover:bg-success/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isNameDuplicate ? 'In Deck' : 'Add to Deck'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
