import { create } from 'zustand';
import type { DeckRole, CollectionEntry } from '../lib/types';
import { buildOptimalDeck, createVirtualBasicLands } from '../lib/deck-engine';
import { analyzeCommander } from '../lib/commander-analyzer';
import { useCollectionStore } from './collectionStore';
import { useToastStore } from './toastStore';

export type PowerLevel = 'casual' | '75%' | 'competitive';

interface DeckState {
  cardIds: string[];
  roles: Record<string, DeckRole>;
  categoryOverrides: Record<string, string>;
  gamePlan: string;
  deckName: string;
  loadedDeckId: string | null;
  isBuilding: boolean;
  powerLevel: PowerLevel;
  virtualEntries: CollectionEntry[];
  addCard: (id: string, role: DeckRole) => void;
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
  roles: {},
  categoryOverrides: {},
  gamePlan: '',
  deckName: '',
  loadedDeckId: null,
  isBuilding: false,
  powerLevel: '75%',
  virtualEntries: [],

  addCard: (id, role) => {
    const { cardIds } = get();
    if (cardIds.length >= 99 || cardIds.includes(id)) return;
    set((s) => ({
      cardIds: [...s.cardIds, id],
      roles: { ...s.roles, [id]: role },
    }));
  },

  removeCard: (id) => {
    set((s) => {
      const { [id]: _, ...restRoles } = s.roles;
      const { [id]: __, ...restOverrides } = s.categoryOverrides;
      return {
        cardIds: s.cardIds.filter((x) => x !== id),
        roles: restRoles,
        categoryOverrides: restOverrides,
      };
    });
  },

  setDeck: (ids, roles, gamePlan, name = '', deckId = null) =>
    set({ cardIds: ids, roles, gamePlan, deckName: name, loadedDeckId: deckId, categoryOverrides: {} }),

  setDeckName: (name) => set({ deckName: name }),

  setCategoryOverride: (id, category) => {
    set((s) => ({
      categoryOverrides: { ...s.categoryOverrides, [id]: category },
    }));
  },

  clearDeck: () =>
    set({ cardIds: [], roles: {}, categoryOverrides: {}, gamePlan: '', deckName: '', loadedDeckId: null, virtualEntries: [] }),

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
        const result = buildOptimalDeck(collection, commanderEntry, get().powerLevel);
        const virtualIds = new Set(result.cardIds.filter((id) => id.startsWith('virtual-basic-')));
        const allVirtual = createVirtualBasicLands(analyzeCommander(commander).ci);
        set({
          cardIds: result.cardIds,
          roles: result.roles,
          gamePlan: result.gamePlan,
          deckName: '',
          loadedDeckId: null,
          isBuilding: false,
          virtualEntries: allVirtual.filter((v) => virtualIds.has(v.scryfallData.id)),
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
