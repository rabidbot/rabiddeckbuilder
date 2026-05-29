import { create } from 'zustand';
import type { DeckRole, CollectionEntry } from '../lib/types';
import { buildOptimalDeck, createVirtualBasicLands } from '../lib/deck-engine';
import { analyzeCommander } from '../lib/commander-analyzer';
import { getDeckCardKey, canRunMultipleCopies } from '../lib/card-utils';
import { useCollectionStore } from './collectionStore';
import { useToastStore } from './toastStore';

export type PowerLevel = 'casual' | '75%' | 'competitive';

interface DeckState {
  cardIds: string[];
  selectedKeys: string[];
  selectedNames: string[];
  roles: Record<string, DeckRole>;
  categoryOverrides: Record<string, string>;
  gamePlan: string;
  deckName: string;
  loadedDeckId: string | null;
  isBuilding: boolean;
  powerLevel: PowerLevel;
  virtualEntries: CollectionEntry[];
  addCard: (card: { id: string; oracle_id: string; name: string; type_line?: string }, role: DeckRole) => void;
  removeCard: (id: string) => void;
  setDeck: (ids: string[], roles: Record<string, DeckRole>, gamePlan: string, name?: string, deckId?: string | null) => void;
  setDeckName: (name: string) => void;
  setCategoryOverride: (id: string, category: string) => void;
  clearDeck: () => void;
  buildDeck: () => void;
  setPowerLevel: (level: PowerLevel) => void;
}

export const useDeckStore = create<DeckState>((set, get) => ({
  cardIds: [],
  selectedKeys: [],
  selectedNames: [],
  roles: {},
  categoryOverrides: {},
  gamePlan: '',
  deckName: '',
  loadedDeckId: null,
  isBuilding: false,
  powerLevel: '75%',
  virtualEntries: [],

  addCard: (card, role) => {
    const { cardIds, selectedKeys, selectedNames } = get();
    const key = getDeckCardKey(card as import('../lib/types').ScryfallCard);
    const nameLower = (card.name || '').toLowerCase();
    if (cardIds.length >= 99 || selectedKeys.includes(key) || cardIds.includes(card.id)) return;
    if (!canRunMultipleCopies(card as import('../lib/types').ScryfallCard) && selectedNames.includes(nameLower)) return;
    set((s) => ({
      cardIds: [...s.cardIds, card.id],
      selectedKeys: [...s.selectedKeys, key],
      selectedNames: [...s.selectedNames, nameLower],
      roles: { ...s.roles, [card.id]: role },
    }));
  },

  removeCard: (id) => {
    set((s) => {
      const remainingIds = s.cardIds.filter((x) => x !== id);
      const { collection } = useCollectionStore.getState();
      const newKeys: string[] = [];
      const newNames: string[] = [];
      for (const rid of remainingIds) {
        const entry = collection.find((e) => e.scryfallData.id === rid)
          || s.virtualEntries.find((v) => v.scryfallData.id === rid);
        if (entry) {
          newKeys.push(getDeckCardKey(entry.scryfallData as import('../lib/types').ScryfallCard));
          newNames.push((entry.scryfallData.name || '').toLowerCase());
        }
      }
      const { [id]: _, ...restRoles } = s.roles;
      const { [id]: __, ...restOverrides } = s.categoryOverrides;
      return {
        cardIds: remainingIds,
        selectedKeys: newKeys,
        selectedNames: newNames,
        roles: restRoles,
        categoryOverrides: restOverrides,
      };
    });
  },

  setDeck: (ids, roles, gamePlan, name = '', deckId = null) => {
    const { collection } = useCollectionStore.getState();
    const seenKeys = new Set<string>();
    const seenNames = new Set<string>();
    const dedupedIds: string[] = [];
    const dedupedKeys: string[] = [];
    const dedupedNames: string[] = [];
    for (const id of ids) {
      const entry = collection.find((e) => e.scryfallData.id === id);
      if (!entry) continue;
      const card = entry.scryfallData;
      const key = getDeckCardKey(card);
      const nameLower = (card.name || '').toLowerCase();
      if (seenKeys.has(key)) continue;
      if (!canRunMultipleCopies(card) && seenNames.has(nameLower)) continue;
      dedupedIds.push(id);
      dedupedKeys.push(key);
      dedupedNames.push(nameLower);
      seenKeys.add(key);
      if (!canRunMultipleCopies(card)) seenNames.add(nameLower);
    }
    set({ cardIds: dedupedIds, selectedKeys: dedupedKeys, selectedNames: dedupedNames, roles, gamePlan, deckName: name, loadedDeckId: deckId, categoryOverrides: {} });
  },

  setDeckName: (name) => set({ deckName: name }),

  setCategoryOverride: (id, category) => {
    set((s) => ({
      categoryOverrides: { ...s.categoryOverrides, [id]: category },
    }));
  },

  clearDeck: () =>
    set({ cardIds: [], selectedKeys: [], selectedNames: [], roles: {}, categoryOverrides: {}, gamePlan: '', deckName: '', loadedDeckId: null, virtualEntries: [] }),

  buildDeck: () => {
    const { collection, commander } = useCollectionStore.getState();
    if (!commander) {
      useToastStore.getState().addToast('Select a commander first', 'error');
      return;
    }

    const commanderEntry = collection.find(
      (e) => e.scryfallData.id === commander.id,
    );
    if (!commanderEntry) {
      useToastStore.getState().addToast('Commander data not found. Try re-importing your collection.', 'error');
      return;
    }

    set({ isBuilding: true });

    setTimeout(() => {
      try {
        // Deduplicate collection by card.id (handles pre-existing duplicate rows in collection)
        const idMap = new Map<string, import('../lib/types').CollectionEntry>();
        for (const e of collection) idMap.set(e.scryfallData.id, e);
        const dedupedCollection = [...idMap.values()];

        const result = buildOptimalDeck(dedupedCollection, commanderEntry, get().powerLevel);
        const virtualIds = new Set(result.cardIds.filter((id) => id.startsWith('virtual-basic-')));
        const allVirtual = createVirtualBasicLands(analyzeCommander(commander).ci);
        const filteredVirtual = allVirtual.filter((v) => virtualIds.has(v.scryfallData.id));

        // Defence-in-depth: flat dedup of literal duplicate IDs
        const beforeDedup = result.cardIds.length;
        const seenIds = new Set<string>();
        const dedupedCardIds = result.cardIds.filter(id => {
          if (seenIds.has(id)) return false;
          seenIds.add(id);
          return true;
        });
        console.log('[buildDeck] result.cardIds:', beforeDedup, '→ deduped:', dedupedCardIds.length);

        const newKeys: string[] = [];
        const newNames: string[] = [];
        for (const id of dedupedCardIds) {
          const entry = collection.find((e) => e.scryfallData.id === id)
            || filteredVirtual.find((v) => v.scryfallData.id === id);
          if (entry) {
            newKeys.push(getDeckCardKey(entry.scryfallData));
            newNames.push((entry.scryfallData.name || '').toLowerCase());
          }
        }

        set({
          cardIds: dedupedCardIds,
          selectedKeys: newKeys,
          selectedNames: newNames,
          roles: result.roles,
          gamePlan: result.gamePlan,
          deckName: '',
          loadedDeckId: null,
          isBuilding: false,
          virtualEntries: filteredVirtual,
        });
      } catch (err) {
        console.error('buildOptimalDeck failed:', err);
        useToastStore.getState().addToast(`Build failed: ${(err as Error).message}`, 'error');
        set({ isBuilding: false });
      }
    }, 0);
  },

  setPowerLevel: (level) => set({ powerLevel: level }),
}));
