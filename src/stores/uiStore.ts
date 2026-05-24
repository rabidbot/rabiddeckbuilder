import { create } from 'zustand';

interface UIState {
  setCollectionCount: (count: number) => void;
  setDeckCount: (count: number) => void;
}

export const useUIStore = create<UIState>(() => ({
  setCollectionCount: () => {},
  setDeckCount: () => {},
}));
