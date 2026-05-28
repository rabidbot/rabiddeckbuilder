import { useMemo, useState, useRef, useEffect } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { useCollectionStore } from '../../stores/collectionStore';
import type { ScryfallCard } from '../../lib/types';

function getColorIdentity(card: ScryfallCard): string[] {
  return (card.color_identity || []).map((c: string) => c.toUpperCase());
}

function isLegendaryCreature(card: ScryfallCard): boolean {
  const t = (card.type_line || '').toLowerCase();
  return t.includes('legendary') && t.includes('creature');
}

export default function CommanderSelector() {
  const collection = useCollectionStore((s) => s.collection);
  const commander = useCollectionStore((s) => s.commander);
  const setCommander = useCollectionStore((s) => s.setCommander);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const legendaries = useMemo(() => {
    return collection
      .filter((e) => e.scryfallData && isLegendaryCreature(e.scryfallData))
      .sort((a, b) => (a.scryfallData.name || '').localeCompare(b.scryfallData.name || ''));
  }, [collection]);

  const filtered = useMemo(() => {
    if (!search.trim()) return legendaries;
    const q = search.toLowerCase();
    return legendaries.filter((e) =>
      (e.scryfallData.name || '').toLowerCase().includes(q),
    );
  }, [legendaries, search]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [search]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[highlightIdx]) {
        e.preventDefault();
        setCommander(filtered[highlightIdx].scryfallData);
        setOpen(false);
        setSearch('');
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, highlightIdx, setCommander]);

  useEffect(() => {
    if (highlightIdx >= 0 && listRef.current) {
      const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx]);

  const ci = commander ? getColorIdentity(commander) : [];
  const selectedEntry = commander
    ? legendaries.find((e) => e.scryfallData.id === commander.id)
    : null;

  if (!legendaries.length && collection.length > 0) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm p-4 text-xs text-text-muted shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
        No legendary creatures found in your collection.
      </div>
    );
  }

  if (!legendaries.length) return null;

  return (
    <div className="relative">
      <div className="rounded-xl border border-border bg-card shadow-sm p-4 flex flex-wrap items-center gap-4 shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-secondary shrink-0">
          Commander
        </span>

        <button
          onClick={() => setOpen(!open)}
          className="flex-1 min-w-[200px] flex items-center justify-between bg-white/[0.04] border border-border-light rounded-lg text-text px-3 py-2 text-sm hover:border-primary transition-colors"
        >
          {commander ? (
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {(ci.length ? ci : ['C']).map((c) => (
                  <span key={c} className="w-4 h-4 rounded-full border border-black/30 flex items-center justify-center text-[9px] font-bold"
                    style={{ background: c==='W'?'#f9f6ee':c==='U'?'#4a90d9':c==='B'?'#8b52a0':c==='R'?'#d94a4a':c==='G'?'#2d8b4a':'#b0a890', color: ['W','C'].includes(c)?'#333':'#fff' }}>
                    {c}
                  </span>
                ))}
              </div>
              <span className="text-primary font-semibold">{commander.name}</span>
            </div>
          ) : (
            <span className="text-text-muted">
              {selectedEntry ? selectedEntry.scryfallData.name : '-- Select a Commander --'}
            </span>
          )}
          <ChevronDown size={15} className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 z-40 mt-2 rounded-xl border border-border-light bg-card backdrop-blur-xl shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-border/50">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search commanders..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white/[0.04] border border-border rounded-lg text-text pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-primary placeholder:text-text-muted"
                />
              </div>
            </div>
            <div ref={listRef} className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-xs text-text-muted text-center">
                  No commanders match "{search}"
                </div>
              ) : (
                filtered.map((entry, idx) => {
                  const card = entry.scryfallData;
                  const cardCI = getColorIdentity(card);
                  const isSelected = commander?.id === card.id;
                  return (
                    <button
                      key={card.id}
                      onClick={() => { setCommander(card); setOpen(false); setSearch(''); }}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors text-xs ${
                        isSelected ? 'bg-primary/10 text-primary' :
                        idx === highlightIdx ? 'bg-hover' : ''
                      }`}
                    >
                      <div className="flex gap-1 shrink-0">
                        {(cardCI.length ? cardCI : ['C']).map((c) => (
                          <span key={c} className="w-4 h-4 rounded-full border border-black/30 flex items-center justify-center text-[8px] font-bold"
                            style={{ background: c==='W'?'#f9f6ee':c==='U'?'#4a90d9':c==='B'?'#8b52a0':c==='R'?'#d94a4a':c==='G'?'#2d8b4a':'#b0a890', color: ['W','C'].includes(c)?'#333':'#fff' }}>
                            {c}
                          </span>
                        ))}
                      </div>
                      <span className="truncate">{card.name}</span>
                      {isSelected && (
                        <span className="ml-auto text-[10px] text-success">&#10003;</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
