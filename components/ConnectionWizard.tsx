import { useState } from 'react';
import type { Status } from '@/lib/api';
import { Icon, type IconName } from './Icon';

const steps: { key: 'connected' | 'unlocked' | 'associated'; label: string; icon: IconName }[] = [
  { key: 'connected', label: 'Conectar', icon: 'plug' },
  { key: 'unlocked', label: 'Desbloquear', icon: 'unlock' },
  { key: 'associated', label: 'Asociar', icon: 'link' },
];

export function ConnectionWizard({
  status,
  busy,
  onUnlock,
  onAssociate,
  onRetry,
}: {
  status: Status | null;
  busy: string | null;
  onUnlock: () => void;
  onAssociate: () => void;
  onRetry: () => void;
}) {
  const [showPath, setShowPath] = useState(false);
  const current = !status?.connected ? 0 : !status.unlocked ? 1 : 2;

  return (
    <div className="mx-auto max-w-2xl animate-fade-up pt-6 sm:pt-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-5 grid size-20 animate-float place-items-center rounded-3xl bg-linear-to-br from-emerald-400 to-cyan-500 text-white shadow-2xl shadow-emerald-500/30">
          <Icon name="shieldCheck" className="size-10" strokeWidth={1.75} />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Tu bóveda,{' '}
          <span className="bg-linear-to-r from-emerald-500 to-cyan-500 bg-clip-text text-transparent">en un vistazo</span>
        </h1>
        <p className="mt-3 text-zinc-500 dark:text-zinc-400">
          Tres pasos y listo. La contraseña maestra se queda siempre en KeePassXC.
        </p>
      </div>

      {/* Stepper */}
      <ol className="mb-6 flex items-center gap-2">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2">
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-500 ${
                  done
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : active
                      ? 'bg-zinc-900 text-white shadow-lg dark:bg-white dark:text-zinc-900'
                      : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                <span
                  className={`grid size-5 place-items-center rounded-full text-[11px] ${
                    done ? 'bg-emerald-500 text-white' : active ? '' : 'ring-1 ring-current'
                  }`}
                >
                  {done ? <Icon name="check" className="size-3" strokeWidth={3} /> : <Icon name={s.icon} className="size-3.5" />}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="h-px flex-1 overflow-hidden rounded bg-zinc-200 dark:bg-white/10">
                  <div
                    className="h-full bg-linear-to-r from-emerald-400 to-cyan-400 transition-all duration-700"
                    style={{ width: done ? '100%' : '0%' }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div key={current} className="glass animate-pop rounded-3xl p-6 sm:p-8">
        {current === 0 && (
          <>
            <StepTitle icon="plug" title="Conecta con KeePassXC" tone="rose">
              No encuentro KeePassXC. Activa la integración con navegador:
            </StepTitle>
            <ol className="mt-5 space-y-3">
              {[
                <>Abre <b>KeePassXC</b> y pulsa <span className="kbd">⌘</span> <span className="kbd">,</span></>,
                <>En la barra lateral entra en <b>Integración con navegador</b></>,
                <>Marca <b>Activar integración con navegador</b> y pulsa <b>Aceptar</b></>,
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-zinc-900/5 text-xs font-semibold dark:bg-white/10">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 leading-relaxed">{t}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button className="btn-soft" onClick={onRetry}>
                <Icon name="refresh" /> Reintentar
              </button>
              <span className="flex items-center gap-2 text-xs text-zinc-500">
                <Icon name="loader" className="size-3.5" /> Buscando cada 5 s…
              </span>
              <span className="flex-1" />
              {status?.socketPath && (
                <button className="text-xs text-zinc-500 underline-offset-2 hover:underline" onClick={() => setShowPath(!showPath)}>
                  {showPath ? 'Ocultar detalle' : 'Detalle técnico'}
                </button>
              )}
            </div>
            {showPath && status?.socketPath && (
              <code className="mt-3 block animate-fade-up rounded-xl bg-zinc-900/5 p-3 font-mono text-xs break-all text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
                {status.socketPath}
              </code>
            )}
          </>
        )}

        {current === 1 && (
          <>
            <StepTitle icon="lock" title="La base está bloqueada" tone="amber">
              Desbloquéala en KeePassXC. Yo solo te abro la ventana; la contraseña la escribes allí.
            </StepTitle>
            <button className="btn-primary mt-6 w-full py-3 sm:w-auto" disabled={!!busy} onClick={onUnlock}>
              <Icon name={busy === 'unlock' ? 'loader' : 'unlock'} /> Desbloquear en KeePassXC
            </button>
          </>
        )}

        {current === 2 && (
          <>
            <StepTitle icon="link" title="Asocia este tablero" tone="emerald">
              KeePassXC te mostrará un diálogo para aprobar la conexión. Ponle un nombre fácil, como{' '}
              <code className="rounded bg-zinc-900/5 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">boveda</code>.
            </StepTitle>
            <button className="btn-primary mt-6 w-full py-3 sm:w-auto" disabled={!!busy} onClick={onAssociate}>
              {busy === 'associate' ? (
                <>
                  <Icon name="loader" /> Esperando tu aprobación en KeePassXC…
                </>
              ) : (
                <>
                  <Icon name="link" /> Asociar con KeePassXC
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StepTitle({
  icon,
  title,
  tone,
  children,
}: {
  icon: IconName;
  title: string;
  tone: 'rose' | 'amber' | 'emerald';
  children: React.ReactNode;
}) {
  const tones = {
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  };
  return (
    <div className="flex items-start gap-4">
      <div className={`grid size-12 shrink-0 place-items-center rounded-2xl ${tones[tone]}`}>
        <Icon name={icon} className="size-6" />
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{children}</p>
      </div>
    </div>
  );
}
