import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Crown, Wand2, Check, ChevronRight } from 'lucide-react';
import { parseManaboxCsv } from '../../lib/csv-parser';
import { fetchCardById } from '../../lib/scryfall';
import { cacheCard, getCachedCard, setInMemoryCache, getFromMemoryCache } from '../../lib/card-cache';
import { insertCollectionEntry, clearCollection, dbSave } from '../../lib/db';
import { scoreCard } from '../../lib/scoring';
import { useCollectionStore } from '../../stores/collectionStore';
import { useDeckStore } from '../../stores/deckStore';
import { useUIStore } from '../../stores/uiStore';
import { useToastStore } from '../../stores/toastStore';
import type { CollectionEntry, ScryfallCard } from '../../lib/types';
import { getColorIdentity } from '../../lib/card-utils';
import { getCardImageUrl } from '../../lib/scryfall';

function isLegendaryCreature(card: ScryfallCard): boolean {
  const t = (card.type_line || '').toLowerCase();
  return t.includes('legendary') && t.includes('creature');
}

function manaColor(c: string) {
  const map: Record<string, string> = { W: '#f9f3e4', U: '#5a9ad4', B: '#8b6a9c', R: '#d45a4a', G: '#3d8b4a', C: '#b0a48a' };
  return map[c] || '#b0a48a';
}

export default function WelcomeView() {
  const navigate = useNavigate();
  const collection = useCollectionStore((s) => s.collection);
  const commander = useCollectionStore((s) => s.commander);
  const setCollection = useCollectionStore((s) => s.setCollection);
  const setCommander = useCollectionStore((s) => s.setCommander);
  const setCollectionCount = useUIStore((s) => s.setCollectionCount);
  const isBuilding = useDeckStore((s) => s.isBuilding);
  const cardIds = useDeckStore((s) => s.cardIds);
  const addToast = useToastStore((s) => s.addToast);

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [showCommanders, setShowCommanders] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const hasCollection = collection.length > 0;
  const hasCommander = !!commander;
  const hasDeck = cardIds.length > 0;

  const legendaries = collection
    .filter((e) => e.scryfallData && isLegendaryCreature(e.scryfallData))
    .sort((a, b) => (a.scryfallData.name || '').localeCompare(b.scryfallData.name || ''));

  const handleImport = useCallback(async (file: File) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setImporting(true);
    setStatus('Reading CSV...');
    setProgress(0);

    try {
      const text = await file.text();
      const rows = parseManaboxCsv(text);
      if (!rows.length) {
        addToast('No valid rows found in CSV', 'error');
        setImporting(false);
        return;
      }
      setStatus(`Parsed ${rows.length} rows. Fetching card data...`);
      console.log('[Import] electronAPI exists:', !!window.electronAPI, 'isElectron:', window.electronAPI?.isElectron);
      console.log('[Import] rows:', rows.length, 'first scryfallId:', rows[0]?.scryfallId);
      await clearCollection();
      const result: CollectionEntry[] = [];
      const total = rows.length;
      let fetchFailed = 0;
      let fetchOK = 0;

      for (let i = 0; i < total; i++) {
        if (controller.signal.aborted) break;
        const row = rows[i];
        setStatus(`Fetching: ${row.name}`);
        setProgress(Math.round(((i + 1) / total) * 100));
        const scryfallId = row.scryfallId || '';
        if (!scryfallId) continue;

        let cardData = getFromMemoryCache(scryfallId);
        if (!cardData) cardData = await getCachedCard(scryfallId);
        if (!cardData) {
          cardData = await fetchCardById(scryfallId);
          if (cardData) {
            await cacheCard(cardData);
            fetchOK++;
          } else {
            fetchFailed++;
            if (fetchFailed <= 3) console.warn('[Import] fetchCardById returned null for:', row.name, scryfallId);
          }
        }
        if (cardData) {
          setInMemoryCache(scryfallId, cardData);
          const csvRowObj = {
            name: row.name, setCode: row.setCode, setName: row.setName,
            collectorNumber: row.collectorNumber, foil: row.foil, rarity: row.rarity,
            quantity: String(row.quantity), manaBoxId: row.manaBoxId, scryfallId: row.scryfallId,
            purchasePrice: String(row.purchasePrice), misprint: row.misprint, altered: row.altered,
            condition: row.condition, language: row.language,
          };
          await insertCollectionEntry(cardData.id, {
            quantity: row.quantity, setCode: row.setCode,
            collectorNumber: row.collectorNumber,
            foil: row.foil?.toLowerCase() === 'true' || row.foil === '1',
            condition: row.condition, language: row.language,
            purchasePrice: row.purchasePrice, csvRow: csvRowObj,
          });
          result.push({ csvRow: csvRowObj, scryfallData: cardData, scores: scoreCard(cardData, csvRowObj, null) });
        }
      }

      console.log(`[Import] Done. OK: ${fetchOK}, Failed: ${fetchFailed}, Result: ${result.length}`);

      if (controller.signal.aborted) return;
      await dbSave();
      setCollection(result);
      setCommander(null);
      setCollectionCount(result.length);
      setStatus(`Loaded ${result.length} cards`);
      setProgress(100);
      addToast(`Imported ${result.length} cards`, 'success');
    } catch (err) {
      addToast(`Import failed: ${(err as Error).message}`, 'error');
    } finally {
      abortRef.current = null;
      setImporting(false);
    }
  }, [setCollection, setCommander, setCollectionCount, addToast]);

  const handleBuild = useCallback(() => {
    useDeckStore.getState().buildDeck();
    setTimeout(() => {
      const { cardIds: count } = useDeckStore.getState();
      addToast(`Built ${count.length}-card deck`, 'success');
      navigate('/builder');
    }, 100);
  }, [navigate, addToast]);

  const stepState = (done: boolean, active: boolean) => {
    if (done) return 'border-success/40 bg-success/[0.04]';
    if (active) return 'border-primary/30 bg-card shadow-md';
    return 'border-border/60 bg-surface-secondary/50 opacity-60';
  };

  return (
    <div className="max-w-3xl mx-auto mt-6 space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-2xl font-bold text-text">Build Your Commander Deck</h2>
        <p className="text-text-secondary mt-1">
          Three steps from collection to playable deck
        </p>
      </div>

      {/* Step 1 — Import */}
      <div className={`rounded-2xl border p-6 transition-all ${stepState(hasCollection, true)}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${hasCollection ? 'bg-success text-white' : 'bg-primary text-white'}`}>
            {hasCollection ? <Check size={16} /> : '1'}
          </div>
          <div>
            <h3 className="font-semibold text-text">Import Your Collection</h3>
            <p className="text-sm text-text-muted">Upload a ManaBox CSV export of your cards</p>
          </div>
          {hasCollection && (
            <span className="ml-auto text-sm font-medium text-success">
              {collection.length} cards
            </span>
          )}
        </div>

        {!hasCollection && !importing && (
          <div
            className="border-2 border-dashed border-border-light rounded-xl p-8 text-center cursor-pointer transition-colors hover:border-primary hover:bg-primary/[0.02]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImport(f); }}
          >
            <input type="file" accept=".csv"
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
            />
            <Upload size={32} className="mx-auto mb-2 text-text-muted" />
            <p className="font-medium text-text">Choose a CSV file or drag it here</p>
            <p className="text-sm text-text-muted mt-1">Exported from ManaBox</p>
          </div>
        )}

        {importing && (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-text">{status}</span>
              <span className="text-sm font-bold text-primary">{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface-secondary overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Step 2 — Commander */}
      <div className={`rounded-2xl border p-6 transition-all ${stepState(hasCommander, hasCollection)}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${hasCommander ? 'bg-success text-white' : hasCollection ? 'bg-primary text-white' : 'bg-border text-text-muted'}`}>
            {hasCommander ? <Check size={16} /> : '2'}
          </div>
          <div>
            <h3 className="font-semibold text-text">Choose Your Commander</h3>
            <p className="text-sm text-text-muted">Pick a legendary creature from your collection</p>
          </div>
          {hasCommander && (
            <div className="ml-auto flex items-center gap-2">
              <div className="flex gap-0.5">
                {(getColorIdentity(commander).length ? getColorIdentity(commander) : ['C']).map((c: string) => (
                  <span key={c} className="w-4 h-4 rounded-full border border-black/20 flex items-center justify-center text-[8px] font-bold"
                    style={{ background: manaColor(c), color: ['W', 'C'].includes(c) ? '#333' : '#fff' }}>{c}</span>
                ))}
              </div>
              <span className="text-sm font-medium text-primary">{commander.name}</span>
            </div>
          )}
        </div>

        {hasCollection && !hasCommander && (
          <>
            {!showCommanders ? (
              <button
                onClick={() => setShowCommanders(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-primary/30 bg-primary/[0.04] text-primary font-medium hover:bg-primary/[0.08] transition-colors"
              >
                <Crown size={18} />
                Select Commander ({legendaries.length} available)
                <ChevronRight size={16} />
              </button>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[320px] overflow-y-auto">
                {legendaries.map((entry) => {
                  const card = entry.scryfallData;
                  const ci = getColorIdentity(card);
                  const img = getCardImageUrl(card, 'small');
                  return (
                    <button
                      key={card.id}
                      onClick={() => { setCommander(card); setShowCommanders(false); }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/[0.03] transition-colors text-left"
                    >
                      {img ? (
                        <img src={img} alt={card.name} className="w-10 h-14 rounded object-cover" loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-10 h-14 rounded bg-surface-secondary flex items-center justify-center text-text-muted text-xs">?</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text truncate">{card.name}</p>
                        <div className="flex gap-0.5 mt-1">
                          {(ci.length ? ci : ['C']).map((c: string) => (
                            <span key={c} className="w-3.5 h-3.5 rounded-full border border-black/20 flex items-center justify-center text-[7px] font-bold"
                              style={{ background: manaColor(c), color: ['W', 'C'].includes(c) ? '#333' : '#fff' }}>{c}</span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Step 3 — Build */}
      <div className={`rounded-2xl border p-6 transition-all ${stepState(hasDeck, hasCommander)}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${hasDeck ? 'bg-success text-white' : hasCommander ? 'bg-primary text-white' : 'bg-border text-text-muted'}`}>
            {hasDeck ? <Check size={16} /> : '3'}
          </div>
          <div>
            <h3 className="font-semibold text-text">Build Your Deck</h3>
            <p className="text-sm text-text-muted">
              {hasDeck ? `${cardIds.length}/99 cards — ready to play` : 'Auto-build an optimized deck for your commander'}
            </p>
          </div>
        </div>

        {hasCommander && (
          <button
            onClick={handleBuild}
            disabled={isBuilding}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-primary text-white font-semibold text-lg shadow-md hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            <Wand2 size={20} />
            {isBuilding ? 'Building...' : hasDeck ? 'Rebuild Deck' : 'Build Optimal Deck'}
          </button>
        )}

        {hasDeck && (
          <p className="text-center text-sm text-text-muted mt-3">
            Deck built! Go to <button onClick={() => navigate('/builder')} className="text-primary underline">Deck Builder</button> to edit and fine-tune.
          </p>
        )}
      </div>
    </div>
  );
}
