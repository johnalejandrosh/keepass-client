import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionWizard } from './ConnectionWizard';
import { Header } from './Header';
import { Icon, type IconName } from './Icon';
import { NewEntryDrawer } from './NewEntryDrawer';
import { SearchPanel } from './SearchPanel';
import { Toaster, useToast } from './Toaster';
import { VaultView } from './VaultView';
import { api, type Group, type Status, type VaultStatus } from '@/lib/api';
import { useHotkeys, useStoredState, useTheme } from '@/lib/hooks';

type Tab = 'vault' | 'site';
const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'vault', label: 'Bóveda completa', icon: 'key' },
  { id: 'site', label: 'Por sitio', icon: 'globe' },
];

export function App() {
  return (
    <Toaster>
      <Shell />
    </Toaster>
  );
}

function Shell() {
  const toast = useToast();
  const { mode, cycle } = useTheme();
  const [tab, setTab] = useStoredState<Tab>('boveda:tab', 'vault');
  const [status, setStatus] = useState<Status | null>(null);
  const [vault, setVault] = useState<VaultStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [drawer, setDrawer] = useState<{ open: boolean; url?: string }>({ open: false });
  const [vaultNew, setVaultNew] = useState(0); // pide a la bóveda abrir su editor de entrada nueva
  const searchRef = useRef<HTMLInputElement>(null);

  const ready = Boolean(status?.connected && status.unlocked && status.associated);
  const vaultActive = tab === 'vault' && Boolean(vault?.open);

  // "Nueva entrada": en la bóveda completa se guarda en el .kdbx; en "Por sitio", vía KeePassXC-Browser
  const newEntry = (url?: string) => {
    if (vaultActive) setVaultNew((n) => n + 1);
    else if (ready) setDrawer({ open: true, url });
  };

  const refreshVault = useCallback(async () => {
    try {
      setVault(await api<VaultStatus>('/api/vault'));
    } catch {
      setVault({ open: false, idleMs: 0 });
    }
  }, []);

  const refresh = useCallback(async () => {
    refreshVault();
    try {
      setStatus(await api<Status>('/api/status'));
    } catch (e) {
      setStatus({ connected: false, error: (e as Error).message });
    }
  }, [refreshVault]);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 5000);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!ready) {
      setGroups([]);
      setDrawer({ open: false });
      return;
    }
    api<{ groups: Group[] }>('/api/groups')
      .then((r) => setGroups(r.groups))
      .catch(() => setGroups([]));
  }, [ready]);

  const run = async (label: string, path: string, method: string, okMsg?: string) => {
    setBusy(label);
    try {
      await api(path, { method });
      if (okMsg) toast(okMsg);
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const lockAll = async () => {
    await api('/api/vault/lock', { method: 'POST' }).catch(() => {});
    if (status?.unlocked) await run('lock', '/api/lock', 'POST', 'Todo bloqueado');
    else {
      toast('Bóveda cerrada');
      refresh();
    }
  };

  useHotkeys({
    'mod+k': () => searchRef.current?.focus(),
    '/': () => searchRef.current?.focus(),
    // En la bóveda completa la tecla N la gestiona la propia vista
    n: () => tab === 'site' && ready && setDrawer({ open: true }),
    escape: () => setDrawer((d) => (d.open ? { open: false } : d)),
  });

  // El explorador de la bóveda abierta usa todo el ancho (barra lateral + lista)
  const wide = vaultActive;

  const tabBar = (
    <div role="tablist" className="inline-flex gap-0.5 rounded-lg bg-zinc-900/[0.05] p-0.5 dark:bg-white/[0.06]">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => setTab(t.id)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition ${
            tab === t.id
              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
              : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
          }`}
        >
          <Icon name={t.icon} className="size-3.5" />
          <span className="max-sm:hidden">{t.label}</span>
          {t.id === 'vault' && vault?.open && <span className="size-1.5 rounded-full bg-emerald-500" />}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <Header
        status={status}
        theme={mode}
        onCycleTheme={cycle}
        canLock={Boolean(vault?.open || status?.unlocked)}
        // En la bóveda abierta, "Nueva entrada" está en su propia barra de herramientas
        canCreate={ready && !vaultActive}
        onLock={lockAll}
        onNew={() => newEntry()}
        tabs={tabBar}
        wide={wide}
      />

      <main className={`mx-auto min-h-[calc(100dvh-8rem)] ${wide ? 'max-w-none px-4 lg:px-0' : 'max-w-5xl px-4 pb-12'}`}>
        {tab === 'vault' ? (
          <VaultView ref={searchRef} vault={vault} onChange={refreshVault} newRequest={vaultNew} />
        ) : !status ? (
          <div className="grid place-items-center pt-32 text-zinc-400">
            <Icon name="loader" className="size-6" />
          </div>
        ) : ready ? (
          <SearchPanel ref={searchRef} onNew={(url) => setDrawer({ open: true, url })} />
        ) : (
          <ConnectionWizard
            status={status}
            busy={busy}
            onRetry={refresh}
            onUnlock={() => run('unlock', '/api/unlock', 'POST')}
            onAssociate={() => run('associate', '/api/associate', 'POST', '¡Listo! Bóveda quedó asociada')}
          />
        )}
      </main>

      {ready && !wide && (
        <footer className="py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
          KeePassXC {status?.version} · asociación <span className="font-medium">{status?.associationId}</span> ·{' '}
          <button className="underline-offset-2 hover:underline" onClick={() => run('forget', '/api/associate', 'DELETE', 'Asociación olvidada')}>
            olvidar
          </button>
        </footer>
      )}

      <NewEntryDrawer
        open={drawer.open}
        initialUrl={drawer.url}
        groups={groups}
        onClose={() => setDrawer({ open: false })}
      />
    </div>
  );
}
