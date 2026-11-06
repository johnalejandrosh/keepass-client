import type { ReactNode } from 'react';
import type { Status } from '@/lib/api';
import type { ThemeMode } from '@/lib/hooks';
import { Icon, Logo } from './Icon';

function StatusBadge({ status }: { status: Status | null }) {
  const s = !status
    ? { tone: 'zinc', label: 'Conectando…' }
    : !status.connected
      ? { tone: 'rose', label: 'Sin conexión' }
      : !status.unlocked
        ? { tone: 'amber', label: 'Bloqueada' }
        : !status.associated
          ? { tone: 'amber', label: 'Sin asociar' }
          : { tone: 'emerald', label: 'Protegida' };

  const tones: Record<string, string> = {
    zinc: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 [--dot:var(--color-zinc-400)]',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 [--dot:var(--color-rose-500)]',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 [--dot:var(--color-amber-500)]',
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 [--dot:var(--color-emerald-500)]',
  };

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${tones[s.tone]}`}>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-(--dot) opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-(--dot)" />
      </span>
      {s.label}
    </span>
  );
}

const themeIcon = { system: 'monitor', light: 'sun', dark: 'moon' } as const;
const themeLabel = { system: 'Tema del sistema', light: 'Tema claro', dark: 'Tema oscuro' };

export function Header({
  status,
  theme,
  onCycleTheme,
  canLock,
  canCreate,
  onLock,
  onNew,
  tabs,
  wide,
}: {
  status: Status | null;
  theme: ThemeMode;
  onCycleTheme: () => void;
  canLock: boolean;
  canCreate: boolean;
  onLock: () => void;
  onNew: () => void;
  /** Pestañas de la app, integradas en la cabecera */
  tabs?: ReactNode;
  /** Ancho completo (explorador de la bóveda) */
  wide?: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/85 backdrop-blur-xl dark:border-white/[0.06] dark:bg-zinc-950/85">
      <div className={`mx-auto flex h-14 items-center gap-3 px-4 ${wide ? 'max-w-none lg:px-6' : 'max-w-5xl'}`}>
        <Logo size="size-8" />
        <div className="leading-tight max-md:hidden">
          <div className="text-sm font-semibold tracking-tight">Bóveda</div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">para KeePassXC</div>
        </div>

        {tabs && <div className="flex min-w-0 flex-1 justify-center md:ml-6 md:justify-start">{tabs}</div>}
        {!tabs && <span className="flex-1" />}

        <div className="hidden sm:block">
          <StatusBadge status={status} />
        </div>

        {canCreate && (
          <>
            <button className="btn-primary hidden h-8 px-3 shadow-none sm:inline-flex" onClick={onNew} title="Nueva entrada (N)">
              <Icon name="plus" /> Nueva
            </button>
            <button className="btn-icon sm:hidden" onClick={onNew} aria-label="Nueva entrada">
              <Icon name="plus" className="size-5" />
            </button>
          </>
        )}
        {canLock && (
          <button className="btn-icon size-8" onClick={onLock} title="Bloquear todo" aria-label="Bloquear todo">
            <Icon name="lock" className="size-[18px]" />
          </button>
        )}

        <button className="btn-icon size-8" onClick={onCycleTheme} title={themeLabel[theme]} aria-label={themeLabel[theme]}>
          <Icon name={themeIcon[theme]} className="size-[18px]" />
        </button>
      </div>
    </header>
  );
}
