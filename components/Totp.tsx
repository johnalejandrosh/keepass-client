import { useEffect, useState } from 'react';
import type { Totp } from '@/lib/api';
import { useNow } from '@/lib/hooks';
import { copyText, TOTP_PERIOD } from '@/lib/secrets';
import { Icon } from './Icon';
import { useToast } from './Toaster';

export type FetchTotp = () => Promise<Totp | null>;

/** Código TOTP en vivo: lo pide al montarse y de nuevo cada vez que cambia el periodo. */
export function useLiveTotp(fetchTotp: FetchTotp) {
  const [totp, setTotp] = useState<Totp | null>(null);
  const [failed, setFailed] = useState(false);
  const now = useNow(1000);
  const period = totp?.period ?? TOTP_PERIOD;
  const step = Math.floor(now / 1000 / period);
  const remaining = period - (Math.floor(now / 1000) % period);

  useEffect(() => {
    let alive = true;
    fetchTotp()
      .then((t) => {
        if (!alive) return;
        setTotp(t);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return { totp, remaining, period, failed };
}

const group = (code: string) => {
  const mid = Math.ceil(code.length / 2);
  return `${code.slice(0, mid)} ${code.slice(mid)}`;
};

export function TotpRing({ remaining, period, className = 'size-6' }: { remaining: number; period: number; className?: string }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const low = remaining <= 5;
  return (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0 -rotate-90`} aria-hidden>
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="3" className="stroke-zinc-200 dark:stroke-white/10" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - remaining / period)}
        className={`transition-[stroke-dashoffset] duration-1000 ease-linear ${low ? 'stroke-rose-500' : 'stroke-emerald-500'}`}
      />
    </svg>
  );
}

function useCopyTotp(code: string | undefined) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const copy = async () => {
    if (!code) return;
    try {
      await copyText(code);
      toast('Código copiado · se borra en 30 s');
      setDone(true);
      window.setTimeout(() => setDone(false), 1400);
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };
  return { copy, done };
}

/** Fila completa: código grande, anillo y "cambia en N s". */
export function TotpPanel({ fetchTotp }: { fetchTotp: FetchTotp }) {
  const { totp, remaining, period, failed } = useLiveTotp(fetchTotp);
  const { copy, done } = useCopyTotp(totp?.code);
  const low = remaining <= 5;

  return (
    <div className="flex items-center gap-1 rounded-2xl bg-zinc-900/[0.03] p-1 pl-3.5 dark:bg-white/[0.03]">
      <Icon name="clock" className="size-4 shrink-0 text-zinc-400" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5">
        {totp ? (
          <>
            <span className="font-mono text-lg font-semibold tracking-[0.3em] tabular-nums">{group(totp.code)}</span>
            <span className="flex items-center gap-1.5">
              <TotpRing remaining={remaining} period={period} />
              <span className={`text-xs tabular-nums ${low ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                Cambia en {remaining} s
              </span>
            </span>
          </>
        ) : failed ? (
          <span className="text-sm text-rose-600 dark:text-rose-400">No se pudo calcular el código</span>
        ) : (
          <span className="flex items-center gap-2 text-sm text-zinc-500">
            <Icon name="loader" className="size-3.5" /> Código de un solo uso…
          </span>
        )}
      </div>
      <button className="btn-icon" onClick={copy} disabled={!totp} title="Copiar código TOTP" aria-label="Copiar código TOTP">
        <Icon
          name={done ? 'check' : 'copy'}
          className={`size-[18px] transition ${done ? 'scale-110 text-emerald-500' : ''}`}
          strokeWidth={done ? 3 : 2}
        />
      </button>
    </div>
  );
}

/** Versión compacta para las filas plegadas: pulsar copia el código. */
export function TotpChip({ fetchTotp }: { fetchTotp: FetchTotp }) {
  const { totp, remaining, period } = useLiveTotp(fetchTotp);
  const { copy, done } = useCopyTotp(totp?.code);
  const low = remaining <= 5;
  if (!totp) return null;

  return (
    <button
      onClick={copy}
      title={`Copiar código · cambia en ${remaining} s`}
      aria-label={`Copiar código de un solo uso, cambia en ${remaining} segundos`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-900/5 py-1 pr-2 pl-1.5 transition hover:bg-emerald-500/10 dark:bg-white/5"
    >
      <TotpRing remaining={remaining} period={period} className="size-5" />
      <span className={`font-mono text-sm font-semibold tracking-wider tabular-nums ${done ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
        {done ? '¡copiado!' : group(totp.code)}
      </span>
      <span className={`w-6 text-right text-[11px] tabular-nums ${low ? 'text-rose-500' : 'text-zinc-400'}`}>{remaining}s</span>
    </button>
  );
}
