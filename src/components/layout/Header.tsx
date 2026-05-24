import { useCollectionStore } from '../../stores/collectionStore';
import { useDeckStore } from '../../stores/deckStore';

export default function Header() {
  const collectionCount = useCollectionStore((s) => s.collection.length);
  const commander = useCollectionStore((s) => s.commander);
  const deckCount = useDeckStore((s) => s.cardIds.length);

  return (
    <header className="sticky top-3 z-50 mx-4 mt-4 px-6 py-4 rounded-2xl border border-[#c9a84c]/20 bg-gradient-to-r from-[#0f0f14]/95 via-[#21180b]/90 to-[#101018]/95 backdrop-blur-xl shadow-[0_20px_45px_rgba(0,0,0,0.42)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#c9a84c]/20 to-[#d4843a]/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <span className="text-[#c9a84c] text-xl">&#9733;</span>
          </div>
          <h1 className="text-xl font-semibold bg-gradient-to-r from-[#e8c86a] to-[#d4843a] bg-clip-text text-transparent">
            EDH Deck Builder
          </h1>
        </div>
        <div className="flex gap-3 text-sm text-[#a0a0b8] flex-wrap">
          <span className="px-3 py-2 rounded-full border border-white/5 bg-white/[0.03]">
            Collection: <strong className="text-[#c9a84c]">{collectionCount}</strong> cards
          </span>
          {commander && (
            <span className="px-3 py-2 rounded-full border border-white/5 bg-white/[0.03]">
              Cmdr: <strong className="text-[#c9a84c]">{commander.name}</strong>
            </span>
          )}
          <span className="px-3 py-2 rounded-full border border-white/5 bg-white/[0.03]">
            Deck: <strong className="text-[#c9a84c]">{deckCount}</strong>/99
          </span>
        </div>
      </div>
    </header>
  );
}
