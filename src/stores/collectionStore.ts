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
    set((s) => {
      const idMap = new Map<string, CollectionEntry>();
      for (const e of s.collection) idMap.set(e.scryfallData.id, e);
      for (const e of entries) idMap.set(e.scryfallData.id, e);
      return { collection: [...idMap.values()] };
    });
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
