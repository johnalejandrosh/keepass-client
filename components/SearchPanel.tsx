import { forwardRef, useState, type FormEvent } from 'react';
import { api, type Entry, type Secret, type Totp } from '@/lib/api';
import { useStoredState } from '@/lib/hooks';
import { Avatar, EntryCard } from './EntryCard';
import { Icon } from './Icon';
import { useToast } from './Toaster';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export const SearchPanel = forwardRef<HTMLInputElement, { onNew: (url?: string) => void }>(function SearchPanel(
  { onNew },
  inputRef,
) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useStoredState<string[]>('boveda:recent', []);
  const [result, setResult] = useState<{ url: string; entries: Entry[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async (q = query) => {
    const term = q.trim();
    if (!term) return;
    setQuery(term);
    setLoading(true);
    try {
      const r = await api<{ url: string; entries: Entry[] }>(`/api/search?url=${encodeURIComponent(term)}`);
      setResult(r);
      setRecent((prev) => [term, ...prev.filter((x) => x !== term)].slice(0, 6));
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setLoading(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    search();
  };

  return (
    <div className="animate-fade-up">
      <div className={`text-center transition-all duration-500 ${result ? 'pt-4 pb-6' : 'pt-10 pb-8 sm:pt-20'}`}>
        {!result && (
          <>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
              ¿Qué{' '}
              <span className="bg-linear-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">llave</span>{' '}
              buscas?
            </h1>
            <p className="mt-3 text-zinc-500 dark:text-zinc-400">Escribe un sitio y Bóveda la trae desde KeePassXC.</p>
          </>
        )}
      </div>

      <form onSubmit={submit} className="group relative mx-auto max-w-2xl">
        <div className="absolute -inset-1 rounded-[28px] bg-linear-to-r from-emerald-400/40 via-teal-400/30 to-cyan-400/40 opacity-0 blur-xl transition duration-500 group-focus-within:opacity-100" />
        <div className="glass relative flex items-center gap-2 rounded-3xl p-2 pl-5 shadow-lg shadow-zinc-900/5 focus-within:ring-4 focus-within:ring-emerald-400/20 dark:shadow-black/30">
          <Icon name="search" className="size-5 shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="github.com"
            aria-label="Sitio o URL"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-lg outline-none placeholder:text-zinc-400"
          />
          {!query && (
            <span className="hidden items-center gap-1 pr-1 sm:flex">
              <span className="kbd">{isMac ? '⌘' : 'Ctrl'}</span>
              <span className="kbd">K</span>
            </span>
          )}
          <button className="btn-primary rounded-2xl px-5 py-2.5" disabled={loading || !query.trim()}>
            {loading ? <Icon name="loader" /> : <Icon name="search" />}
            <span className="hidden sm:inline">Buscar</span>
          </button>
        </div>
      </form>

      {recent.length > 0 && (
        <div className="mx-auto mt-4 flex max-w-2xl flex-wrap items-center justify-center gap-2">
          {recent.map((r) => (
            <button
              key={r}
              onClick={() => search(r)}
              className="group inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/60 py-1 pr-1 pl-1 text-sm text-zinc-600 transition hover:border-emerald-400/60 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-white"
            >
              <Avatar name={r} size="size-6 rounded-full! text-[11px]!" />
              {r}
              <span
                role="button"
                aria-label={`Quitar ${r}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setRecent((prev) => prev.filter((x) => x !== r));
                }}
                className="grid size-5 place-items-center rounded-full opacity-0 transition group-hover:opacity-60 hover:bg-zinc-900/10 hover:opacity-100! dark:hover:bg-white/10"
              >
                <Icon name="x" className="size-3" />
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto mt-10 max-w-5xl">
        {loading && (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="glass rounded-3xl p-4">
                <div className="flex gap-3">
                  <div className="skeleton size-11 rounded-2xl" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="skeleton h-4 w-1/2" />
                    <div className="skeleton h-3 w-1/3" />
                  </div>
                </div>
                <div className="skeleton mt-4 h-11 rounded-2xl" />
              </div>
            ))}
          </div>
        )}

        {!loading && result && result.entries.length > 0 && (
          <>
            <div className="mb-4 flex items-center gap-2 px-1 text-sm text-zinc-500 dark:text-zinc-400">
              <Icon name="globe" className="size-4" />
              <span className="truncate">{result.url}</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {result.entries.length}
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {result.entries.map((e, i) => (
                <EntryCard
                  key={e.uuid}
                  entry={e}
                  index={i}
                  fetchSecret={() => api<Secret>('/api/reveal', { method: 'POST', body: { url: result.url, uuid: e.uuid } })}
                  fetchTotp={() =>
                    api<{ totp: Totp | null }>('/api/totp', { method: 'POST', body: { url: result.url, uuid: e.uuid } }).then((r) => r.totp)
                  }
                />
              ))}
            </div>
          </>
        )}

        {!loading && result && result.entries.length === 0 && (
          <div className="glass mx-auto max-w-md animate-pop rounded-3xl p-8 text-center">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-zinc-900/5 text-zinc-400 dark:bg-white/5">
              <Icon name="search" className="size-6" />
            </div>
            <h3 className="font-semibold">Nada para {result.url.replace(/^https?:\/\//, '')}</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              KeePassXC busca por la URL guardada en cada entrada.
            </p>
            <button className="btn-primary mt-5" onClick={() => onNew(result.url)}>
              <Icon name="plus" /> Crear entrada para este sitio
            </button>
          </div>
        )}

        {!result && !loading && (
          <div className="mx-auto mt-6 grid max-w-3xl gap-3 sm:grid-cols-3">
            {[
              { icon: 'shieldCheck', title: 'Sin contraseña maestra', text: 'Se desbloquea en KeePassXC, nunca aquí.' },
              { icon: 'clock', title: 'Se borra sola', text: 'El portapapeles se limpia a los 30 s.' },
              { icon: 'sparkles', title: 'Atajos', text: '⌘K busca · N crea una entrada · Esc cierra.' },
            ].map((f, i) => (
              <div key={f.title} style={{ animationDelay: `${150 + i * 80}ms` }} className="glass animate-fade-up rounded-2xl p-4">
                <Icon name={f.icon as 'clock'} className="size-5 text-emerald-500" />
                <div className="mt-2 text-sm font-medium">{f.title}</div>
                <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{f.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
