import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Upload, Library, Wand2, BarChart3, Swords, Menu, X } from 'lucide-react';

const navItems = [
  { to: '/', icon: Home, label: 'Home', end: true },
  { to: '/import', icon: Upload, label: 'Import' },
  { to: '/collection', icon: Library, label: 'Collection' },
  { to: '/builder', icon: Wand2, label: 'Deck Builder' },
  { to: '/stats', icon: BarChart3, label: 'Stats' },
  { to: '/tracker', icon: Swords, label: 'Tracker' },
];

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = navItems.map(({ to, icon: Icon, label, end }) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      onClick={() => setMobileOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary/10 text-primary border border-primary/20'
            : 'text-text-secondary hover:bg-hover hover:text-text'
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  ));

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-16 left-4 z-30 w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-text-secondary hover:text-text transition-colors shadow-sm"
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 z-50 w-64 bg-surface-secondary border-r border-border flex flex-col gap-1 px-3 py-20 shadow-lg">
            {navLinks}
          </aside>
        </>
      )}
    </>
  );
}
