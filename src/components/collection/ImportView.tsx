import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { parseManaboxCsv } from '../../lib/csv-parser';
import { fetchCardById } from '../../lib/scryfall';
import { cacheCard, getCachedCard, setInMemoryCache, getFromMemoryCache } from '../../lib/card-cache';
import { insertCollectionEntry, clearCollection, dbSave } from '../../lib/db';
import { scoreCard } from '../../lib/scoring';
import { useCollectionStore } from '../../stores/collectionStore';
import { useUIStore } from '../../stores/uiStore';
import { useToastStore } from '../../stores/toastStore';
import type { CollectionEntry } from '../../lib/types';

export default function ImportView() {
  const navigate = useNavigate();
  const setCollection = useCollectionStore((s) => s.setCollection);
  const setCommander = useCollectionStore((s) => s.setCommander);
  const setCollectionCount = useUIStore((s) => s.setCollectionCount);
  const addToast = useToastStore((s) => s.addToast);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
    setImporting(false);
    addToast('Import cancelled', 'info');
  }, [addToast]);

  const processFile = useCallback(async (file: File) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setImporting(true);
    setWarnings([]);
    setStatus('Reading CSV...');
    setProgress(0);

    try {
      const text = await file.text();
      const rows = parseManaboxCsv(text);

      if (!rows.length) {
        setWarnings(['No valid rows found in CSV']);
        setImporting(false);
        addToast('No valid rows found in CSV', 'error');
        return;
      }

      setStatus(`Parsed ${rows.length} rows. Fetching card data...`);

      await clearCollection();
      const collection: CollectionEntry[] = [];
      const total = rows.length;
      let skipCount = 0;

      for (let i = 0; i < total; i++) {
        if (controller.signal.aborted) break;

        const row = rows[i];
        setStatus(`Fetching: ${row.name}`);
        setProgress(Math.round(((i + 1) / total) * 100));

        const scryfallId = row.scryfallId || '';

        if (!scryfallId) {
          setWarnings((prev) => [...prev, `Skipped "${row.name}": no Scryfall ID`]);
          skipCount++;
          continue;
        }

        let cardData = getFromMemoryCache(scryfallId);

        if (!cardData) {
          cardData = await getCachedCard(scryfallId);
        }

        if (!cardData) {
          cardData = await fetchCardById(scryfallId);
          if (cardData) {
            await cacheCard(cardData);
          }
        }

        if (cardData) {
          setInMemoryCache(scryfallId, cardData);
          const csvRowObj = {
            name: row.name,
            setCode: row.setCode,
            setName: row.setName,
            collectorNumber: row.collectorNumber,
            foil: row.foil,
            rarity: row.rarity,
            quantity: String(row.quantity),
            manaBoxId: row.manaBoxId,
            scryfallId: row.scryfallId,
            purchasePrice: String(row.purchasePrice),
            misprint: row.misprint,
            altered: row.altered,
            condition: row.condition,
            language: row.language,
          };
          await insertCollectionEntry(cardData.id, {
            quantity: row.quantity,
            setCode: row.setCode,
            collectorNumber: row.collectorNumber,
            foil: row.foil?.toLowerCase() === 'true' || row.foil === '1',
            condition: row.condition,
            language: row.language,
            purchasePrice: row.purchasePrice,
            csvRow: csvRowObj,
          });

          collection.push({
            csvRow: csvRowObj,
            scryfallData: cardData,
            scores: scoreCard(cardData, csvRowObj, null),
          });
        } else {
          setWarnings((prev) => [...prev, `Skipped "${row.name}": fetch failed`]);
          skipCount++;
        }
      }

      if (controller.signal.aborted) {
        setStatus('Import cancelled');
        setProgress(0);
        return;
      }

      await dbSave();
      setCollection(collection);
      setCommander(null);
      setCollectionCount(collection.length);
      setStatus(`Done! Loaded ${collection.length} cards.`);
      setProgress(100);
      addToast(`Loaded ${collection.length} cards`, 'success');
      if (skipCount > 0) addToast(`${skipCount} cards skipped`, 'info');

      setTimeout(() => {
        navigate('/collection');
      }, 800);
    } catch (err) {
      setWarnings((prev) => [...prev, `Error: ${(err as Error).message}`]);
      addToast(`Import failed: ${(err as Error).message}`, 'error');
    } finally {
      abortRef.current = null;
      setImporting(false);
    }
  }, [navigate, setCollection, setCommander, setCollectionCount]);

  return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-[#1f1f28]/90 to-[#14141c]/90 p-10 text-center shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
        <Upload size={48} className="mx-auto mb-4 text-[#a0a0b8]/50" />
        <h2 className="text-2xl font-semibold text-[#c9a84c] mb-2">Import Your Collection</h2>
        <p className="text-[#a0a0b8] text-sm mb-8 leading-relaxed">
          Upload a CSV exported from ManaBox to get started.
          <br />
          Card data will be loaded from Scryfall and scored automatically.
        </p>

        {!importing && (
          <div
            className="relative border-2 border-dashed border-[#44445a] rounded-lg p-10 cursor-pointer transition-colors hover:border-[#c9a84c] hover:bg-[#c9a84c]/5 bg-white/[0.02] mb-6"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) processFile(file);
            }}
          >
            <input
              type="file"
              accept=".csv"
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processFile(file);
              }}
            />
            <p className="text-[#a0a0b8] pointer-events-none">
              <strong className="block text-[#c9a84c] text-base mb-2">Click to choose file or drag & drop</strong>
              <span className="text-sm">Accepts ManaBox CSV export (.csv)</span>
            </p>
          </div>
        )}

        {importing && (
          <div className="rounded-xl border border-[#333344] bg-[#1e1e24] p-8 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-[#e8e8f0]">{status}</span>
              <span className="text-sm font-bold text-[#c9a84c]">{progress}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-[#0d0d0f] overflow-hidden mb-4">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8b6914] to-[#c9a84c] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-center">
              <button
                onClick={handleAbort}
                className="px-4 py-2 rounded-lg bg-[#e05252]/10 border border-[#e05252]/20 text-[#e05252] text-xs font-medium hover:bg-[#e05252]/20 transition-colors"
              >
                Cancel Import
              </button>
            </div>
          </div>
        )}

        <div className="bg-white/[0.03] border border-white/5 rounded-lg p-4 text-left text-xs text-[#6a6a88]">
          <strong className="text-[#a0a0b8] block mb-2">Expected Columns:</strong>
          <code className="text-[#c9a84c] font-mono">
            Name, Set code, Set name, Collector number, Foil, Rarity, Quantity, ManaBox ID,
            Scryfall ID, Purchase price, Misprint, Altered, Condition, Language
          </code>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mt-6 rounded-xl border border-[#d4843a]/20 bg-[#d4843a]/5 p-6">
          <h3 className="text-sm font-semibold text-[#d4843a] mb-3">
            Warnings ({warnings.length})
          </h3>
          <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
            {warnings.map((w, i) => (
              <div key={i} className="text-xs text-[#d4843a]/80 flex items-start gap-2">
                <span className="shrink-0 mt-0.5">&#9888;</span>
                {w}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
