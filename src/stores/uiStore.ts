import { create } from 'zustand';

interface UIState {
  onboardingComplete: boolean;
  setOnboardingComplete: (val: boolean) => void;
  showHelp: boolean;
  setShowHelp: (val: boolean) => void;
  setCollectionCount: (count: number) => void;
  setDeckCount: (count: number) => void;
}

const ONBOARDING_KEY = 'edh-onboarding-v1-seen';

export const useUIStore = create<UIState>((set) => ({
  onboardingComplete: typeof window !== 'undefined' ? localStorage.getItem(ONBOARDING_KEY) === 'true' : false,
  setOnboardingComplete: (val) => {
    localStorage.setItem(ONBOARDING_KEY, String(val));
    set({ onboardingComplete: val });
  },
  showHelp: false,
  setShowHelp: (val) => set({ showHelp: val }),
  setCollectionCount: () => {},
  setDeckCount: () => {},
}));
