import { useEffect, useRef, useState } from 'react';
import type { Secret } from '@/lib/api';
import { useNow } from '@/lib/hooks';
import { copyText, REVEAL_MS } from '@/lib/secrets';
import { Icon, type IconName } from './Icon';
import { TotpPanel, type FetchTotp } from './Totp';
import { useToast } from './Toaster';

const gradients = [
  'from-emerald-400 to-teal-600',
  'from-sky-400 to-indigo-600',
  'from-fuchsia-400 to-purple-600',
  'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600',
  'from-cyan-400 to-blue-600',
  'from-lime-400 to-green-600',
  'from-violet-400 to-indigo-600',
];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function Avatar({ name, size = 'size-11', text = 'text-lg', className = '' }: { name: string; size?: string; text?: string; className?: string }) {
  const clean = name.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const letter = (clean.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase();
  return (
    <div
      className={`${size} grid shrink-0 place-items-center rounded-2xl bg-linear-to-br ${gradients[hash(clean) % gradients.length]} ${text} font-semibold text-white shadow-md ring-1 ring-white/20 ring-inset ${className}`}
    >
      {letter}
    </div>
  );
}

/** Colorea dígitos y símbolos para que la contraseña sea fácil de leer. */
function ColoredSecret({ value }: { value: string }) {
  return (
    <span className="font-mono text-[15px] tracking-wide break-all">
      {[...value].map((c, i) => (
        <span
          key={i}
          className={
            /\d/.test(c) ? 'text-sky-600 dark:text-sky-400' : /[a-z]/i.test(c) ? '' : 'text-fuchsia-600 dark:text-fuchsia-400'
          }
        >
          {c}
        </span>
      ))}
    </span>
  );
}

export function ActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => Promise<void> | void;
  disabled?: boolean;
}) {
  const [done, setDone] = useState(false);
  const run = async () => {
    try {
      await onClick();
      setDone(true);
      window.setTimeout(() => setDone(false), 1400);
    } catch {
      /* el toast ya informa */
    }
  };
  return (
    <button className="btn-icon" onClick={run} disabled={disabled} title={label} aria-label={label}>
      <Icon
        name={done ? 'check' : icon}
        className={`size-[18px] transition ${done ? 'scale-110 text-emerald-500' : ''}`}
        strokeWidth={done ? 3 : 2}
      />
    </button>
  );
}

export interface CardEntry {
  uuid: string;
  name: string;
  login: string;
  group?: string;
  url?: string;
  hasTotp: boolean;
  expired: boolean;
  hasNotes?: boolean;
  hasFields?: boolean;
}

export function hostOf(url: string) {
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).host;
  } catch {
    return url;
  }
}

export const hrefOf = (url: string) => (/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`);

/** Estado de una entrada: secreto revelado (se oculta solo), TOTP vivo y acciones de copiar. */
export function useEntrySecret(entry: CardEntry, fetchSecret: () => Promise<Secret>) {
  const toast = useToast();
  const [secret, setSecret] = useState<Secret | null>(null);
  const [revealedAt, setRevealedAt] = useState(0);
  const hideTimer = useRef<number | undefined>(undefined);
  const now = useNow(1000, Boolean(secret));

  const revealLeft = secret ? Math.max(0, 1 - (now - revealedAt) / REVEAL_MS) : 0;

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const hide = () => {
    window.clearTimeout(hideTimer.current);
    setSecret(null);
  };

  const toggleReveal = async () => {
    if (secret) return hide();
    try {
      setSecret(await fetchSecret());
      setRevealedAt(Date.now());
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setSecret(null), REVEAL_MS);
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  const copy = (what: 'login' | 'password') => async () => {
    try {
      if (what === 'login') {
        await copyText(entry.login, false);
        return toast('Usuario copiado');
      }
      await copyText((await fetchSecret()).password);
      toast('Contraseña copiada · se borra en 30 s');
    } catch (e) {
      toast((e as Error).message, 'err');
      throw e;
    }
  };

  return { secret, revealLeft, toggleReveal, hide, copy };
}

export type EntrySecretState = ReturnType<typeof useEntrySecret>;

/** Contraseña, TOTP, notas y campos extra de una entrada. */
export function SecretBody({ entry, state, fetchTotp }: { entry: CardEntry; state: EntrySecretState; fetchTotp: FetchTotp }) {
  const toast = useToast();
  const { secret, revealLeft, toggleReveal, copy } = state;
  return (
    <>
      {/* Contraseña */}
      <div className="rounded-2xl bg-zinc-900/[0.03] p-1 pl-3.5 dark:bg-white/[0.03]">
        <div className="flex items-center gap-1">
          <Icon name="key" className="size-4 shrink-0 text-zinc-400" />
          <div className="min-w-0 flex-1 px-2 py-1.5">
            {secret ? (
              <ColoredSecret value={secret.password} />
            ) : (
              <span className="font-mono tracking-[0.25em] text-zinc-400 select-none">••••••••••••</span>
            )}
          </div>
          <ActionButton icon="user" label="Copiar usuario" onClick={copy('login')} disabled={!entry.login} />
          <ActionButton icon="copy" label="Copiar contraseña" onClick={copy('password')} />
          <button className="btn-icon" onClick={toggleReveal} title={secret ? 'Ocultar' : 'Mostrar'} aria-label={secret ? 'Ocultar' : 'Mostrar'}>
            <Icon name={secret ? 'eyeOff' : 'eye'} className="size-[18px]" />
          </button>
        </div>
        {secret && (
          <div className="mx-2 mb-1 h-0.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
            <div className="h-full bg-emerald-500 transition-[width] duration-1000 ease-linear" style={{ width: `${revealLeft * 100}%` }} />
          </div>
        )}
      </div>

      {/* TOTP: siempre visible, con cuenta regresiva */}
      {entry.hasTotp && (
        <div className="mt-2">
          <TotpPanel fetchTotp={fetchTotp} />
        </div>
      )}

      {/* Notas y campos (al mostrar) */}
      {secret && (secret.notes?.trim() || Object.keys(secret.fields ?? {}).length > 0) && (
        <div className="mt-2 animate-fade-up space-y-2 rounded-2xl bg-zinc-900/[0.03] p-3.5 text-sm dark:bg-white/[0.03]">
          {Object.entries(secret.fields ?? {}).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{k}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{v}</span>
              <button className="btn-icon size-6" onClick={() => copyText(v).then(() => toast(`${k} copiado`))} aria-label={`Copiar ${k}`}>
                <Icon name="copy" className="size-3.5" />
              </button>
            </div>
          ))}
          {secret.notes?.trim() && <p className="whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-300">{secret.notes}</p>}
        </div>
      )}
      {!secret && (entry.hasNotes || entry.hasFields) && (
        <div className="mt-2 px-1 text-xs text-zinc-400">
          {entry.hasNotes && entry.hasFields ? 'Tiene notas y campos extra' : entry.hasNotes ? 'Tiene notas' : 'Tiene campos extra'} · pulsa <Icon name="eye" className="inline size-3" />
        </div>
      )}
    </>
  );
}

export function EntryCard({
  entry,
  fetchSecret,
  fetchTotp,
  index,
}: {
  entry: CardEntry;
  fetchSecret: () => Promise<Secret>;
  fetchTotp: FetchTotp;
  index: number;
}) {
  const state = useEntrySecret(entry, fetchSecret);

  return (
    <article
      style={{ animationDelay: `${index * 50}ms` }}
      className="glass group relative animate-fade-up overflow-hidden rounded-3xl p-4 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-zinc-900/5 dark:hover:shadow-black/40"
    >
      {/* brillo al pasar el ratón */}
      <div className="pointer-events-none absolute -top-24 -right-24 size-48 rounded-full bg-emerald-400/0 blur-3xl transition duration-500 group-hover:bg-emerald-400/15" />

      <div className="flex items-start gap-3">
        <Avatar name={entry.name || entry.url || '?'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold tracking-tight">{entry.name || '(sin título)'}</h3>
            {entry.expired && (
              <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                Expirada
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
            <Icon name="user" className="size-3.5 shrink-0" />
            <span className="truncate">{entry.login || 'Sin usuario'}</span>
          </div>
          {entry.url && (
            <a
              href={hrefOf(entry.url)}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-emerald-700/80 hover:text-emerald-600 hover:underline dark:text-emerald-400/80"
            >
              <Icon name="globe" className="size-3 shrink-0" />
              <span className="truncate">{hostOf(entry.url)}</span>
            </a>
          )}
        </div>
        {entry.group && (
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-zinc-900/5 px-2.5 py-1 text-xs text-zinc-600 sm:inline-flex dark:bg-white/5 dark:text-zinc-400">
            <Icon name="folder" className="size-3" /> {entry.group}
          </span>
        )}
      </div>

      <div className="mt-4">
        <SecretBody entry={entry} state={state} fetchTotp={fetchTotp} />
      </div>
    </article>
  );
}
