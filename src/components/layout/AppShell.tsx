import { Outlet } from 'react-router-dom';
import { X } from 'lucide-react';
import Header from './Header';
import Sidebar from './Sidebar';
import { useToastStore } from '../../stores/toastStore';

export default function AppShell() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 max-w-[1660px] mx-auto w-full overflow-hidden">
          <Outlet />
        </main>
      </div>

      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl toast-enter
              ${toast.type === 'success' ? 'bg-[#52c272]/10 border-[#52c272]/30 text-[#52c272]'
              : toast.type === 'error' ? 'bg-[#e05252]/10 border-[#e05252]/30 text-[#e05252]'
              : 'bg-[#c9a84c]/10 border-[#c9a84c]/30 text-[#e8c86a]'}
            `}
          >
            <div className="flex items-center gap-2">
              <span className="flex-1">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="opacity-60 hover:opacity-100 transition-opacity"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
