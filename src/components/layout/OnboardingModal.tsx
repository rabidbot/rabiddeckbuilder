import { useState } from 'react';
import { X, Upload, Crown, Wand2 } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

interface Props {
  onDismiss: () => void;
}

const STEPS = [
  {
    icon: Upload,
    title: 'Import your collection',
    text: 'Upload a CSV export of your card collection. We support ManaBox CSVs (Settings → Export collection in the ManaBox app). Drag the file onto the Import tab, or click to browse. First fetch takes a minute.',
  },
  {
    icon: Crown,
    title: 'Pick a commander',
    text: 'Head to the Collection tab and select any legendary creature from your collection as your commander. You can change this anytime — the app will rescore all your cards for the new color identity and strategy.',
  },
  {
    icon: Wand2,
    title: 'Build a deck',
    text: 'Go to the Deck Builder tab and hit Build. The app analyzes your commander, picks the best strategy your collection supports, and generates a 100-card legal deck with mana base. You can edit any card manually or rebuild.',
  },
];

export default function OnboardingModal({ onDismiss }: Props) {
  const [dontShow, setDontShow] = useState(false);
  const { setOnboardingComplete, setOnboardingDismissed, setShowHelp } = useUIStore();

  const handleDismiss = () => {
    if (dontShow) setOnboardingComplete(true);
    setShowHelp(false);
    setOnboardingDismissed(true);
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-[998] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fade-in_0.2s_ease-out]">
      <div className="relative w-full max-w-[520px] mx-4 bg-card border border-border rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.4)] p-6 animate-[fade-in-up_0.3s_ease-out]">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-text-muted hover:text-text transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <h2 className="text-lg font-semibold text-text mb-5">Getting Started</h2>

        <div className="space-y-4">
          {STEPS.map((step, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary text-xs font-bold">
                {i + 1}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <step.icon size={14} className="text-primary" />
                  <h3 className="text-sm font-medium text-text">{step.title}</h3>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">{step.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary/30"
            />
            Don&apos;t show this again
          </label>
          <button
            onClick={handleDismiss}
            className="px-4 py-2 rounded-xl bg-gradient-to-br from-accent to-primary-dark text-white text-sm font-semibold hover:brightness-110 transition-all duration-200"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
