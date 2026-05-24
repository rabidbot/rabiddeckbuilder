import { create } from 'zustand';
import type { CollectionEntry, ScryfallCard } from '../lib/types';
import { scoreCard } from '../lib/scoring';

interface CollectionState {
  collection: CollectionEntry[];
  commander: ScryfallCard | null;
  setCollection: (entries: CollectionEntry[]) => void;
  addEntries: (entries: CollectionEntry[]) => void;
  setCommander: (card: ScryfallCard | null) => void;
  rescoreAll: () => void;
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  collection: [],
  commander: null,

  setCollection: (entries) => {
    set({ collection: entries });
  },

  addEntries: (entries) => {
    set((s) => ({
      collection: [...s.collection, ...entries],
    }));
  },

  setCommander: (card) => {
    set({ commander: card });
    get().rescoreAll();
  },

  rescoreAll: () => {
    const { collection, commander } = get();
    const rescored = collection.map((entry) => ({
      ...entry,
      scores: scoreCard(entry.scryfallData, entry.csvRow, commander),
    }));
    set({ collection: rescored });
  },
}));
