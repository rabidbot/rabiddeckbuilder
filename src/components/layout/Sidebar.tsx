import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Upload, Library, Wand2, BarChart3, Swords, Menu, X } from 'lucide-react';

const navItems = [
  { to: '/', icon: Upload, label: 'Import' },
  { to: '/collection', icon: Library, label: 'Collection' },
  { to: '/builder', icon: Wand2, label: 'Deck Builder' },
  { to: '/stats', icon: BarChart3, label: 'Stats' },
  { to: '/tracker', icon: Swords, label: 'Tracker' },
];

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = navItems.map(({ to, icon: Icon, label }) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/'}
      onClick={() => setMobileOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-[#8b6914]/20 text-[#e8c86a] border border-[#c9a84c]/20'
            : 'text-[#a0a0b8] hover:bg-[#2d2d38] hover:text-[#e8e8f0]'
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  ));

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-24 left-4 z-30 w-10 h-10 rounded-xl bg-[#1e1e24] border border-[#333344] flex items-center justify-center text-[#a0a0b8] hover:text-[#e8e8f0] transition-colors shadow-lg"
        aria-label="Toggle sidebar"
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 bg-[#16161a] border-r border-[#333344] flex-col gap-1 px-3 py-4 shrink-0">
        {navLinks}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="lg:hidden fixed left-0 top-0 bottom-0 z-50 w-64 bg-[#16161a] border-r border-[#333344] flex flex-col gap-1 px-3 py-20 shadow-2xl">
            {navLinks}
          </aside>
        </>
      )}
    </>
  );
}
