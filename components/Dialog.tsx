import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export interface DialogRequest {
  title: string;
  text?: ReactNode;
  icon?: IconName;
  confirmLabel: string;
  danger?: boolean;
  /** Si se indica, el diálogo pide un texto (p. ej. el nombre de una carpeta). */
  input?: { label: string; placeholder?: string; initial?: string };
  /** Lanza error para mantener el diálogo abierto (el que llama muestra el aviso). */
  onConfirm: (value: string) => Promise<void> | void;
}

/** Confirmación o pregunta corta, centrada. Muestra "trabajando…" mientras corre la acción. */
export function Dialog({ request, onClose }: { request: DialogRequest | null; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) return;
    setValue(request.input?.initial ?? '');
    setBusy(false);
    window.setTimeout(() => (request.input ? inputRef.current?.select() : confirmRef.current?.focus()), 50);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, busy, onClose]);

  if (!request) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await request.onConfirm(value.trim());
      onClose();
    } catch {
      setBusy(false);
    }
  };

  const icon = request.icon ?? (request.danger ? 'trash' : 'alert');

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 animate-[fade-up_0.2s_both] bg-zinc-950/40 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <form
        onSubmit={submit}
        role="alertdialog"
        aria-modal="true"
        aria-label={request.title}
        className="relative w-full max-w-sm animate-pop rounded-3xl border border-zinc-200/70 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
      >
        <div
          className={`mb-4 grid size-12 place-items-center rounded-2xl ${
            request.danger ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          }`}
        >
          <Icon name={icon} className="size-6" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{request.title}</h2>
        {request.text && <div className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{request.text}</div>}

        {request.input && (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">{request.input.label}</span>
            <input
              ref={inputRef}
              required
              className="field"
              placeholder={request.input.placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        )}

        <div className="mt-6 flex gap-3">
          <button type="button" className="btn-soft flex-1" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            ref={confirmRef}
            className={`flex-1 ${request.danger ? 'btn bg-rose-600 text-white shadow-lg shadow-rose-600/25 hover:bg-rose-500' : 'btn-primary'}`}
            disabled={busy || (Boolean(request.input) && !value.trim())}
          >
            {busy && <Icon name="loader" />}
            {busy ? 'Guardando…' : request.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
