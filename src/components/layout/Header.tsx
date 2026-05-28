import { NavLink } from 'react-router-dom';
import { Home, Upload, Crown, Wand2, BarChart3, Swords } from 'lucide-react';
import { useCollectionStore } from '../../stores/collectionStore';
import { useDeckStore } from '../../stores/deckStore';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/import', icon: Upload, label: 'Import' },
  { to: '/collection', icon: Crown, label: 'Commander' },
  { to: '/builder', icon: Wand2, label: 'Deck Builder' },
  { to: '/stats', icon: BarChart3, label: 'Stats' },
  { to: '/tracker', icon: Swords, label: 'Tracker' },
];

export default function Header() {
  const collectionCount = useCollectionStore((s) => s.collection.length);
  const commander = useCollectionStore((s) => s.commander);
  const deckCount = useDeckStore((s) => s.cardIds.length);

  return (
    <header className="sticky top-0 z-50 border-b border-primary/5 bg-card/80 backdrop-blur-md shadow-[0_1px_0_rgba(255,170,0,0.04)]">
      <div className="max-w-[1660px] mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <NavLink to="/" className="flex items-center gap-2.5 shrink-0">
              <span className="text-xl">&#9733;</span>
              <span className="text-lg font-bold text-text tracking-tight hidden sm:block">
                Deck Builder
              </span>
            </NavLink>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-primary/10 text-primary shadow-[0_0_12px_rgba(255,170,0,0.15)] ring-1 ring-primary/20'
                        : 'text-text-secondary hover:bg-hover hover:text-text'
                    }`
                  }
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-text-secondary">
              <span className="text-text-muted">Collection:</span>
              <span className="font-semibold text-text">{collectionCount}</span>
            </span>
            {commander && (
              <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/20 bg-primary/[0.03] text-text-secondary animate-[pulse-glow_2s_ease-in-out_infinite]">
                <span className="text-text-muted">Cmdr:</span>
                <span className="font-semibold text-primary truncate max-w-[160px]">{commander.name}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-text-secondary">
              <span className="text-text-muted">Deck:</span>
              <span className="font-semibold text-text">{deckCount}/99</span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
