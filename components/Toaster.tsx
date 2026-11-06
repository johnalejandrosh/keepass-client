import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

type Kind = 'ok' | 'err';
export interface ToastAction {
  label: string;
  run: () => void;
}
interface Toast {
  id: number;
  msg: string;
  kind: Kind;
  action?: ToastAction;
}

const ToastCtx = createContext<(msg: string, kind?: Kind, action?: ToastAction) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

let seq = 0;

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (msg: string, kind: Kind = 'ok', action?: ToastAction) => {
      const id = ++seq;
      setToasts((t) => [...t.slice(-3), { id, msg, kind, action }]);
      // Con acción (p. ej. Deshacer) se queda más tiempo
      window.setTimeout(() => dismiss(id), action ? 8000 : 3800);
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="glass pointer-events-auto flex w-full max-w-sm animate-toast items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-xl"
          >
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full ${
                t.kind === 'ok'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
              }`}
            >
              <Icon name={t.kind === 'ok' ? 'check' : 'alert'} className="size-4" />
            </span>
            <span className="min-w-0 flex-1">{t.msg}</span>
            {t.action && (
              <button
                className="shrink-0 rounded-lg px-2.5 py-1 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/10 dark:text-emerald-400"
                onClick={() => {
                  dismiss(t.id);
                  t.action!.run();
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
