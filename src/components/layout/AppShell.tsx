import { Outlet } from 'react-router-dom';
import { X } from 'lucide-react';
import Header from './Header';
import OnboardingModal from './OnboardingModal';
import { useToastStore } from '../../stores/toastStore';
import { useUIStore } from '../../stores/uiStore';

export default function AppShell() {
  const { toasts, removeToast } = useToastStore();
  const { onboardingComplete, onboardingDismissed, showHelp, setShowHelp } = useUIStore();
  const showOnboarding = (!onboardingComplete && !onboardingDismissed) || showHelp;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 p-4 md:p-6 max-w-[1660px] mx-auto w-full overflow-hidden animate-[fade-in-up_0.35s_ease-out]">
        <Outlet />
      </main>

      {showOnboarding && (
        <OnboardingModal onDismiss={() => setShowHelp(false)} />
      )}

      <div className="fixed bottom-6 right-6 z-[999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              pointer-events-auto glass rounded-xl border px-4 py-3 text-sm shadow-lg toast-enter
              ${toast.type === 'success' ? 'bg-success/10 border-success/30 text-success'
              : toast.type === 'error' ? 'bg-danger/10 border-danger/30 text-danger'
              : 'bg-primary/10 border-primary/20 text-primary'}
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
