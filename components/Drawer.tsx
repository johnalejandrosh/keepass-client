import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Panel lateral deslizante con cabecera. */
export function Drawer({
  open,
  title,
  subtitle,
  icon,
  onClose,
  children,
  width = 'max-w-md',
}: {
  width?: string;
  open: boolean;
  title: string;
  subtitle?: string;
  icon: IconName;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-zinc-950/30 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-y-0 right-0 flex w-full ${width} flex-col border-l border-zinc-200/70 bg-white/95 shadow-2xl backdrop-blur-2xl transition-[translate,visibility] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] dark:border-white/10 dark:bg-zinc-900/95 ${
          open ? 'visible translate-x-0' : 'invisible translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-zinc-200/70 px-6 py-5 dark:border-white/5">
          <div className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Icon name={icon} className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold tracking-tight">{title}</h2>
            {subtitle && <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" className="size-5" />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function Field({ label, icon, hint, children }: { label: string; icon?: IconName; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="relative block">
        {icon && <Icon name={icon} className="pointer-events-none absolute top-[1.3rem] left-3.5 z-10 size-4 -translate-y-1/2 text-zinc-400" />}
        {children}
      </span>
      {hint && <span className="mt-1.5 block text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>}
    </label>
  );
}
