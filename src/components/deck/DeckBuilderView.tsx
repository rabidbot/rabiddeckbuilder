import { useMemo, useState, useCallback, useEffect } from 'react';
import { Wand2, Trash2, Download, Save, FolderOpen, ClipboardPaste } from 'lucide-react';
import { useCollectionStore } from '../../stores/collectionStore';
import { useDeckStore } from '../../stores/deckStore';
import { useToastStore } from '../../stores/toastStore';
import { saveDeck, loadDeck, listDecks, deleteDeck } from '../../lib/db';
import { analyzeCommander } from '../../lib/commander-analyzer';
import { getDeckBlueprint } from '../../lib/deck-blueprint';
import { detectCardRoles } from '../../lib/card-roles';
import type { CollectionEntry, DeckProfile } from '../../lib/types';
import DeckWorkspace from './DeckWorkspace';

function buildProfile(
  entries: CollectionEntry[],
  cmdAnalysis: ReturnType<typeof analyzeCommander>,
): DeckProfile {
  const profile: DeckProfile = {
    entries,
    total: entries.length,
    nonLands: 0,
    lands: 0,
    ramp: 0,
    draw: 0,
    interaction: 0,
    wipes: 0,
    protection: 0,
    recursion: 0,
    tutors: 0,
    finishers: 0,
    synergy: 0,
    avgComposite: entries.length
      ? Math.round(entries.reduce((s, e) => s + e.scores.composite, 0) / entries.length)
      : 0,
    curve: { low: 0, mid: 0, high: 0, finisher: 0 },
    sources: { W: 0, U: 0, B: 0, R: 0, G: 0 },
  };

  for (const entry of entries) {
    const card = entry.scryfallData;
    const tags = detectCardRoles(card, cmdAnalysis);
    if (tags.land) profile.lands++;
    else {
      profile.nonLands++;
      profile.curve[tags.bucket]++;
    }
    if (tags.ramp && !tags.land) profile.ramp++;
    if (tags.draw) profile.draw++;
    if (tags.interaction) profile.interaction++;
    if (tags.wipe) profile.wipes++;
    if (tags.protection) profile.protection++;
    if (tags.recursion) profile.recursion++;
    if (tags.tutor) profile.tutors++;
    if (tags.finisher) profile.finishers++;
    if (tags.synergy) profile.synergy++;
    if (tags.land || tags.ramp) {
      for (const color of tags.producedColors) {
        if (profile.sources[color] !== undefined) profile.sources[color]++;
      }
    }
  }
  return profile;
}

function fixStatusColor(actual: number, min: number, soft: number, good: number) {
  if (actual >= good) return 'text-success';
  if (actual >= soft) return 'text-primary';
  if (actual >= min) return 'text-accent';
  return 'text-danger';
}

function barColor(actual: number, good: number, soft: number) {
  if (actual >= good) return 'bg-gradient-to-r from-success to-[#3d6a30]';
  if (actual >= soft) return 'bg-gradient-to-r from-primary to-primary-dark';
  return 'bg-gradient-to-r from-accent to-danger';
}

export default function DeckBuilderView() {
  const collection = useCollectionStore((s) => s.collection);
  const commander = useCollectionStore((s) => s.commander);
  const { cardIds, roles, gamePlan, deckName: activeDeckName, loadedDeckId, isBuilding, powerLevel, buildDeck, clearDeck, setPowerLevel } = useDeckStore();
  const addToast = useToastStore((s) => s.addToast);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [savedDecks, setSavedDecks] = useState<Array<{ id: string; name: string; commanderId: string; updatedAt: string }>>([]);

  const refreshDecks = useCallback(async () => {
    const decks = await listDecks();
    setSavedDecks(decks);
  }, []);

  useEffect(() => {
    if (loadModalOpen) refreshDecks();
  }, [loadModalOpen, refreshDecks]);

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

  const blueprint = useMemo(
    () => (cmdAnalysis ? getDeckBlueprint(cmdAnalysis, powerLevel) : null),
    [cmdAnalysis, powerLevel],
  );

  const profile = useMemo(
    () => (cmdAnalysis ? buildProfile(deckEntries, cmdAnalysis) : null),
    [deckEntries, cmdAnalysis],
  );

  const statRows = blueprint
    ? [
        { label: 'Lands', actual: profile?.lands ?? 0, target: blueprint.lands, min: Math.max(1, blueprint.lands - 3), soft: blueprint.lands - 1, good: blueprint.lands + 1 },
        { label: 'Ramp', actual: profile?.ramp ?? 0, target: blueprint.ramp, min: Math.max(1, blueprint.ramp - 4), soft: blueprint.ramp - 2, good: blueprint.ramp },
        { label: 'Draw', actual: profile?.draw ?? 0, target: blueprint.draw, min: Math.max(1, blueprint.draw - 4), soft: blueprint.draw - 2, good: blueprint.draw },
        { label: 'Interaction', actual: profile?.interaction ?? 0, target: blueprint.interaction, min: Math.max(1, blueprint.interaction - 4), soft: blueprint.interaction - 2, good: blueprint.interaction },
        { label: 'Wipes', actual: profile?.wipes ?? 0, target: blueprint.wipes, min: 0, soft: blueprint.wipes, good: blueprint.wipes },
        { label: 'Protection', actual: profile?.protection ?? 0, target: blueprint.protection, min: Math.max(0, blueprint.protection - 3), soft: blueprint.protection - 1, good: blueprint.protection },
        { label: 'Tutors', actual: profile?.tutors ?? 0, target: blueprint.tutors, min: 0, soft: Math.max(1, blueprint.tutors - 1), good: blueprint.tutors },
        { label: 'Finishers', actual: profile?.finishers ?? 0, target: blueprint.finishers, min: Math.max(1, blueprint.finishers - 3), soft: blueprint.finishers - 1, good: blueprint.finishers },
      ]
    : [];

  const handleBuild = useCallback(() => {
    buildDeck();
    setTimeout(() => {
      const { cardIds: count, gamePlan: plan } = useDeckStore.getState();
      addToast(`Built ${count.length}-card deck: ${plan}`, 'success');
    }, 80);
  }, [buildDeck, addToast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        handleBuild();
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (deckEntries.length > 0) {
          setDeckName(activeDeckName || '');
          setSaveModalOpen(true);
          setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>('#save-deck-name');
            if (input) input.focus();
          }, 100);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleBuild, deckEntries.length, activeDeckName]);

  if (!collection.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Wand2 size={64} className="text-text-secondary/30 mb-4" />
        <h2 className="text-xl font-semibold text-text mb-2">Deck Builder</h2>
        <p className="text-text-secondary text-sm max-w-md">
          Import a collection and select a commander first, then build your deck here.
        </p>
      </div>
    );
  }

  if (!commander) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Wand2 size={64} className="text-text-secondary/30 mb-4" />
        <h2 className="text-xl font-semibold text-text mb-2">Select a Commander</h2>
        <p className="text-text-secondary text-sm max-w-md">
          Go to the Collection tab and pick a legendary creature from your collection.
        </p>
      </div>
    );
  }

  const handleClear = () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      setTimeout(() => setClearConfirm(false), 3000);
      return;
    }
    clearDeck();
    setClearConfirm(false);
    addToast('Deck cleared', 'info');
  };

  const handleExport = () => {
    const lines: string[] = [];
    lines.push('// Commander');
    if (cmdrEntry) {
      const cmd = cmdrEntry.scryfallData;
      lines.push(`1 ${cmd.name} (${cmd.set.toUpperCase()}) ${cmd.collector_number}  *CMDR*`);
    }
    lines.push('');
    for (const entry of deckEntries) {
      if (entry.scryfallData.id === commander?.id) continue;
      const c = entry.scryfallData;
      lines.push(`1 ${c.name} (${c.set.toUpperCase()}) ${c.collector_number}`);
    }
    navigator.clipboard.writeText(lines.join('\n'));
    addToast('Decklist copied (Moxfield format)', 'success');
  };

  const handleImport = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        addToast('Clipboard is empty', 'error');
        return;
      }
      const lines = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
      const names = lines
        .map((line) => {
          const match = line.match(/^\d+x?\s+(.+?)(?:\s+\([^)]+\))?(?:\s+\d+)?(?:\s+\*CMDR\*)?\s*$/i);
          if (match) return match[1].trim();
          return line.replace(/^\d+x?\s+/, '').split('(')[0].trim();
        })
        .filter(Boolean);

      let imported = 0;
      for (const name of names) {
        const found = collection.find(
          (e) => e.scryfallData.name?.toLowerCase() === name.toLowerCase(),
        );
        if (found) {
          const { addCard } = useDeckStore.getState();
          addCard(found.scryfallData.id, { role: 'Imported', reason: `Imported: ${name}` });
          imported++;
        }
      }
      addToast(`Imported ${imported}/${names.length} cards from clipboard`, 'success');
    } catch {
      addToast('Failed to read clipboard. Paste a decklist first.', 'error');
    }
  };

  const handleSave = async () => {
    if (!deckName.trim() || !commander) return;
    const id = loadedDeckId || crypto.randomUUID();
    await saveDeck({
      id,
      name: deckName.trim(),
      commanderId: commander.id,
      cardIds,
      roles,
      gamePlan,
    });
    useDeckStore.getState().setDeckName(deckName.trim());
    addToast(`Saved "${deckName.trim()}"`, 'success');
    setSaveModalOpen(false);
    setDeckName('');
  };

  const handleLoad = async (deckId: string) => {
    const deck = await loadDeck(deckId);
    if (deck) {
      const loadedDeck = savedDecks.find((d) => d.id === deckId);
      useDeckStore.getState().setDeck(
        deck.cardIds,
        deck.roles,
        deck.gamePlan,
        loadedDeck?.name || '',
        deckId,
      );

      const cmdrEntry = collection.find((e) => e.scryfallData.id === deck.commanderId);
      if (cmdrEntry) {
        useCollectionStore.getState().setCommander(cmdrEntry.scryfallData);
      } else {
        addToast('Commander not found in current collection. Select one manually.', 'error');
      }

      addToast(`Loaded "${loadedDeck?.name || 'Deck'}"`, 'success');
      setLoadModalOpen(false);
    }
  };

  const handleDeleteDeck = async (deckId: string, name: string) => {
    await deleteDeck(deckId);
    addToast(`Deleted "${name}"`, 'info');
    await refreshDecks();
  };

  return (
    <div className="space-y-3">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-text">
              {commander.name}
            </h2>
            {activeDeckName && (
              <span className="text-xs text-text-muted bg-black/[0.03] border border-border/50 px-2.5 py-0.5 rounded-full">
                {activeDeckName}
              </span>
            )}
          </div>
          {gamePlan && (
            <p className="text-xs text-text-secondary mt-0.5">{gamePlan}</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleBuild}
            disabled={isBuilding}
            title="Ctrl+B"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-accent to-primary-dark text-white font-semibold text-sm shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Wand2 size={15} />
            {isBuilding ? 'Building...' : 'Build Optimal Deck'}
          </button>
          <div className="flex rounded-xl border border-border-light overflow-hidden">
            {(['casual', '75%', 'competitive'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setPowerLevel(level)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  powerLevel === level
                    ? 'bg-primary/20 text-primary'
                    : 'text-text-muted hover:text-text-secondary hover:bg-black/[0.02]'
                }`}
              >
                {level === 'competitive' ? 'cEDH' : level === '75%' ? 'High Power' : 'Casual'}
              </button>
            ))}
          </div>
          {deckEntries.length > 0 && (
            <>
              <button
                onClick={() => { setDeckName(activeDeckName || ''); setSaveModalOpen(true); }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-light text-text-secondary text-sm hover:border-[#52c272] hover:text-success transition-colors"
                title="Ctrl+S"
              >
                <Save size={15} />
                Save
              </button>
              <button
                onClick={() => setLoadModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-light text-text-secondary text-sm hover:border-info hover:text-info transition-colors"
              >
                <FolderOpen size={15} />
                Load
              </button>
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-light text-text-secondary text-sm hover:border-[#c9a84c] hover:text-primary transition-colors"
              >
                <Download size={15} />
                Export
              </button>
              <button
                onClick={handleImport}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-light text-text-secondary text-sm hover:border-purple hover:text-purple transition-colors"
              >
                <ClipboardPaste size={15} />
                Import
              </button>
              <button
                onClick={handleClear}
                onBlur={() => setClearConfirm(false)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
                  clearConfirm
                    ? 'border-[#e05252] bg-[#e05252]/10 text-danger'
                    : 'border-border-light text-text-secondary hover:border-[#e05252] hover:text-danger'
                }`}
              >
                <Trash2 size={15} />
                {clearConfirm ? 'Confirm?' : 'Clear'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hero Stats Row */}
      {blueprint && profile && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-2">
          <div className="rounded-xl border border-[#c9a84c]/20 bg-gradient-to-br from-primary/8 to-info/3 p-3 col-span-2 md:col-span-1">
            <div className="text-[9px] uppercase tracking-[0.12em] text-text-muted mb-1">Game Plan</div>
            <div className="text-sm font-bold text-text">{gamePlan || 'No plan'}</div>
            <div className="text-[10px] text-text-secondary mt-0.5">
              {cmdAnalysis?.posture === 'control' ? 'Controlling' : cmdAnalysis?.posture === 'aggro' ? 'Aggressive' : 'Midrange'}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {cmdAnalysis?.themes.map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded-full text-[9px] border border-primary/12 bg-black/[0.02] text-text-secondary">
                  {t}
                </span>
              ))}
            </div>
          </div>

          {statRows.slice(0, 4).map((row) => (
            <div key={row.label} className="rounded-xl border border-border bg-card shadow-sm p-3 shadow-[0_12px_24px_rgba(0,0,0,0.2)]">
              <div className="text-[9px] uppercase tracking-[0.12em] text-text-muted mb-0.5">{row.label}</div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-lg font-bold ${fixStatusColor(row.actual, row.min, row.soft, row.good)}`}>
                  {row.actual}
                </span>
                <span className="text-[10px] text-text-muted">/ {row.target}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor(row.actual, row.good, row.soft)}`}
                  style={{ width: `${Math.min(100, (row.actual / Math.max(1, row.target)) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drag & Drop Workspace */}
      <DeckWorkspace key={commander?.id} />

      {/* Save Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSaveModalOpen(false)}>
          <div className="rounded-2xl border border-white/10 bg-card p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-text mb-4">Save Deck</h3>
            <input
              id="save-deck-name"
              type="text"
              placeholder="Deck name..."
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
              className="w-full bg-black/[0.03] border border-border rounded-lg text-text px-3 py-2 text-sm focus:outline-none focus:border-[#c9a84c] placeholder:text-text-muted mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSaveModalOpen(false)} className="px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={!deckName.trim()} className="px-4 py-2 rounded-lg bg-[#52c272]/15 border border-[#52c272]/20 text-success text-sm font-medium hover:bg-[#52c272]/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Load Modal */}
      {loadModalOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setLoadModalOpen(false)}>
          <div className="rounded-2xl border border-white/10 bg-card p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-text mb-4">Load Deck</h3>
            {savedDecks.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-6">No saved decks yet.</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto mb-4">
                {savedDecks.map((deck) => (
                  <div key={deck.id} className="flex items-center group hover:bg-black/[0.03] rounded-lg transition-colors">
                    <button
                      onClick={() => handleLoad(deck.id)}
                      className="flex-1 text-left px-3 py-2.5"
                    >
                      <span className="block text-sm text-text group-hover:text-primary transition-colors">{deck.name}</span>
                      <span className="text-[10px] text-text-muted">{deck.updatedAt}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteDeck(deck.id, deck.name); }}
                      className="px-2 py-1.5 text-text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      aria-label="Delete deck"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => setLoadModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
