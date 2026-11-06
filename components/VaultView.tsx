import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useRef,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { api, type Secret, type Totp, type VaultEntry, type VaultSecret, type VaultStatus } from '@/lib/api';
import { useHotkeys, useNow, useStoredState } from '@/lib/hooks';
import { copyText } from '@/lib/secrets';
import { Attachments, clearAttachmentCache } from './Attachments';
import { ContextMenu, menuAt, type MenuItem, type MenuRequest } from './ContextMenu';
import { Dialog, type DialogRequest } from './Dialog';
import { ActionButton, Avatar, hostOf, hrefOf, SecretBody, useEntrySecret, type CardEntry, type EntrySecretState } from './EntryCard';
import { Drawer } from './Drawer';
import { Icon, type IconName } from './Icon';
import { TotpChip, type FetchTotp } from './Totp';
import { useToast } from './Toaster';
import { VaultEntryDrawer, type EditorMode } from './VaultEntryDrawer';

const PAGE = 60;

// --- Árbol de grupos a partir de las rutas "Raíz/Trabajo/AWS" -------------------
interface GroupNode {
  name: string;
  path: string;
  count: number;
  children: GroupNode[];
}

function buildTree(entries: VaultEntry[], groups: string[]): GroupNode {
  const root: GroupNode = { name: 'Todas', path: '', count: 0, children: [] };
  // Devuelve los nodos de la ruta (sin la raíz), creándolos si hace falta
  const chain = (group: string) => {
    const [head, ...parts] = group.split('/'); // la raíz es común a todas
    const out: GroupNode[] = [];
    let node = root;
    let acc = head;
    for (const part of parts) {
      acc += '/' + part;
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: acc, count: 0, children: [] };
        node.children.push(child);
      }
      out.push(child);
      node = child;
    }
    return out;
  };
  groups.forEach(chain); // también las carpetas vacías
  for (const e of entries) {
    root.count++;
    for (const n of chain(e.group)) n.count++;
  }
  const sort = (n: GroupNode) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// --- Vista principal -----------------------------------------------------------
type Refresh = () => Promise<void> | void;

export const VaultView = forwardRef<
  HTMLInputElement,
  { vault: VaultStatus | null; onChange: Refresh; newRequest?: number }
>(function VaultView({ vault, onChange, newRequest = 0 }, ref) {
  if (!vault) {
    return (
      <div className="grid place-items-center pt-32 text-zinc-400">
        <Icon name="loader" className="size-6" />
      </div>
    );
  }
  return vault.open ? (
    <OpenVault ref={ref} vault={vault} onChange={onChange} newRequest={newRequest} />
  ) : (
    <UnlockCard onOpened={onChange} />
  );
});

// --- Abrir la bóveda -----------------------------------------------------------
function UnlockCard({ onOpened }: { onOpened: Refresh }) {
  const toast = useToast();
  const [candidates, setCandidates] = useState<string[]>([]);
  const [dbPath, setDbPath] = useStoredState('boveda:dbPath', '');
  const [keyFile, setKeyFile] = useStoredState('boveda:keyFile', '');
  const [showKey, setShowKey] = useState(Boolean(keyFile));
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ files: string[] }>('/api/vault/candidates')
      .then((r) => {
        setCandidates(r.files);
        if (!dbPath && r.files[0]) setDbPath(r.files[0]);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/api/vault/open', { method: 'POST', body: { dbPath, password, keyFile: showKey ? keyFile || undefined : undefined } });
      setPassword('');
      toast('Bóveda abierta');
      onOpened();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fileName = (p: string) => p.split('/').pop()?.replace(/\.kdbx$/i, '') ?? p;
  const dirName = (p: string) => p.replace(/\/[^/]+$/, '').replace(/^\/Users\/[^/]+/, '~');

  return (
    <div className="mx-auto max-w-xl animate-fade-up pt-6 sm:pt-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-5 grid size-20 animate-float place-items-center rounded-3xl bg-linear-to-br from-emerald-400 to-cyan-500 text-white shadow-2xl shadow-emerald-500/30">
          <Icon name="lock" className="size-9" strokeWidth={1.75} />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Abre tu{' '}
          <span className="bg-linear-to-r from-emerald-500 to-cyan-500 bg-clip-text text-transparent">bóveda completa</span>
        </h1>
        <p className="mt-3 text-zinc-500 dark:text-zinc-400">
          Todas tus entradas, por grupos, con búsqueda instantánea. Se cierra sola tras 5 min sin uso.
        </p>
      </div>

      <form onSubmit={submit} className="glass animate-pop space-y-5 rounded-3xl p-6 sm:p-8">
        <div>
          <span className="mb-2 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Base de datos</span>
          <div className="grid gap-2">
            {candidates.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setDbPath(c)}
                className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                  dbPath === c
                    ? 'border-emerald-400 bg-emerald-500/5 ring-4 ring-emerald-400/15'
                    : 'border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20'
                }`}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                    dbPath === c ? 'bg-emerald-500 text-white' : 'bg-zinc-900/5 text-zinc-500 dark:bg-white/5'
                  }`}
                >
                  <Icon name="key" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{fileName(c)}</span>
                  <span className="block truncate text-xs text-zinc-500">{dirName(c)}</span>
                </span>
                {dbPath === c && <Icon name="check" className="size-4 text-emerald-500" strokeWidth={3} />}
              </button>
            ))}
          </div>
          <input
            className="field mt-2 font-mono text-xs"
            placeholder="/ruta/completa/a/mi-base.kdbx"
            value={dbPath}
            onChange={(e) => setDbPath(e.target.value)}
            aria-label="Ruta del archivo .kdbx"
          />
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Contraseña maestra</span>
          <span className="relative block">
            <Icon name="key" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              autoFocus
              type={show ? 'text' : 'password'}
              className="field pr-11 pl-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button type="button" className="btn-icon absolute top-1/2 right-1.5 size-8 -translate-y-1/2" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar' : 'Mostrar'}>
              <Icon name={show ? 'eyeOff' : 'eye'} />
            </button>
          </span>
        </label>

        {showKey ? (
          <label className="block animate-fade-up">
            <span className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Archivo de clave (opcional)</span>
            <input className="field font-mono text-xs" placeholder="/ruta/a/clave.keyx" value={keyFile} onChange={(e) => setKeyFile(e.target.value)} />
          </label>
        ) : (
          <button type="button" className="text-xs text-zinc-500 underline-offset-2 hover:underline" onClick={() => setShowKey(true)}>
            + Usar archivo de clave
          </button>
        )}

        {error && (
          <div className="flex animate-pop items-center gap-2 rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-600 dark:text-rose-400">
            <Icon name="alert" className="size-4 shrink-0" /> {error}
          </div>
        )}

        <button className="btn-primary w-full py-3" disabled={loading || !dbPath || (!password && !(showKey && keyFile))}>
          {loading ? (
            <>
              <Icon name="loader" /> Descifrando… (puede tardar unos segundos)
            </>
          ) : (
            <>
              <Icon name="unlock" /> Abrir bóveda
            </>
          )}
        </button>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          <Icon name="shieldCheck" className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
          La contraseña va directo a keepassxc-cli en tu equipo y no se guarda. El contenido descifrado vive solo en memoria y
          se borra al cerrar, tras 5 min de inactividad o al bloquear KeePassXC.
        </p>
      </form>
    </div>
  );
}

// --- Bóveda abierta: explorador de carpetas ----------------------------------------
const findNode = (root: GroupNode, path: string): GroupNode | null => {
  if (root.path === path) return root;
  for (const c of root.children) {
    if (path === c.path || path.startsWith(c.path + '/')) return findNode(c, path);
  }
  return null;
};

/** Cadena de carpetas desde la raíz hasta `path` (para las migas de pan). */
const trail = (root: GroupNode, path: string): GroupNode[] => {
  const out = [root];
  let node = root;
  while (node.path !== path) {
    const next = node.children.find((c) => path === c.path || path.startsWith(c.path + '/'));
    if (!next) break;
    out.push(next);
    node = next;
  }
  return out;
};

/** ¿La entrada está directamente en esta carpeta (no en una subcarpeta)? */
const isDirect = (e: VaultEntry, path: string) => (path === '' ? !e.group.includes('/') : e.group === path);
const inSubtree = (e: VaultEntry, path: string) => path === '' || e.group === path || e.group.startsWith(path + '/');
const prettyGroup = (g: string) => g.split('/').slice(1).join(' / ');
const depthOf = (path: string) => (path ? path.split('/').length - 1 : 0);

/** Vistas rápidas de la barra lateral: recorren toda la bóveda. */
type SmartId = 'all' | 'totp' | 'attachments' | 'expired';
const SMART: { id: SmartId; label: string; icon: IconName; test: (e: VaultEntry) => boolean }[] = [
  { id: 'all', label: 'Todas las entradas', icon: 'key', test: () => true },
  { id: 'totp', label: 'Con código 2FA', icon: 'clock', test: (e) => e.hasTotp },
  { id: 'attachments', label: 'Con adjuntos', icon: 'paperclip', test: (e) => e.attachments.length > 0 },
  { id: 'expired', label: 'Expiradas', icon: 'alert', test: (e) => e.expired },
];

/** Acciones y estado del explorador, compartidos con tarjetas, filas y árbol. */
interface VaultActions {
  edit: (e: VaultEntry) => void;
  remove: (e: VaultEntry) => void;
  ask: (r: DialogRequest) => void;
  refresh: () => Promise<void>;
  revision: number;
  entries: VaultEntry[];
  open: (path: string) => void;
  /** Ruta del árbol ('' = raíz) → ruta completa del grupo. */
  full: (path: string) => string;
  // Mover entradas (arrastrar y soltar, o "Mover a…")
  dragging: VaultEntry | null;
  setDragging: (e: VaultEntry | null) => void;
  moving: Set<string>;
  move: (e: VaultEntry, toGroup: string) => void;
  pickFolder: (e: VaultEntry) => void;
  // Menús contextuales
  menu: (at: { x: number; y: number; alignRight?: boolean }, title: string, items: MenuItem[]) => void;
  folderMenu: (node: GroupNode, at: { x: number; y: number; alignRight?: boolean }) => void;
  /** Abre una entrada en el panel lateral de detalle */
  showDetail: (uuid: string) => void;
}
const ActionsCtx = createContext<VaultActions | null>(null);

const OpenVault = forwardRef<HTMLInputElement, { vault: VaultStatus; onChange: Refresh; newRequest: number }>(function OpenVault(
  { vault, onChange, newRequest },
  ref,
) {
  const toast = useToast();
  const [entries, setEntries] = useState<VaultEntry[] | null>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const deferred = useDeferredValue(query);
  const now = useNow(1000);

  useEffect(() => {
    // Se recarga al abrir y tras cada cambio guardado (revision)
    api<{ entries: VaultEntry[]; groups: string[] }>('/api/vault/entries')
      .then((r) => {
        setEntries(r.entries);
        setGroups(r.groups);
      })
      .catch((e) => {
        toast((e as Error).message, 'err');
        onChange();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.openedAt, vault.revision]);

  useEffect(() => setLimit(PAGE), [deferred, folder]);

  const tree = useMemo(() => {
    const t = buildTree(entries ?? [], groups);
    t.name = vault.name ?? 'Bóveda';
    return t;
  }, [entries, groups, vault.name]);

  // Si la carpeta actual desaparece (p. ej. al reabrir), vuelve al inicio
  const current = findNode(tree, folder) ?? tree;
  const crumbs = trail(tree, current.path);
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  const searching = deferred.trim().length > 0;

  // Vista rápida (todas, con 2FA, con adjuntos, expiradas) y modo de visualización
  const [smart, setSmart] = useState<SmartId | null>(null);
  const smartDef = SMART.find((x) => x.id === smart) ?? null;
  const flat = searching || Boolean(smartDef); // lista plana con la carpeta de cada entrada
  const [view, setView] = useStoredState<'list' | 'grid'>('boveda:view', 'list');
  const [sidebar, setSidebar] = useStoredState('boveda:sidebar', true);
  const [detail, setDetail] = useState<string | null>(null); // entrada abierta en el panel (vista cuadrícula)

  // Dirección de la animación: entrar en una subcarpeta desliza desde la derecha; subir, desde la izquierda
  const [dir, setDir] = useState<'in' | 'out' | null>(null);
  const open = (path: string) => {
    if (path !== current.path) setDir(depthOf(path) > depthOf(current.path) ? 'in' : 'out');
    setSmart(null);
    setFolder(path);
    setQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openSmart = (id: SmartId) => {
    setDir(null);
    setSmart(id);
    setQuery('');
  };

  const visible = useMemo(() => {
    if (!entries) return [];
    if (!flat) return entries.filter((e) => isDirect(e, current.path));
    const base = smartDef ? entries.filter(smartDef.test) : entries.filter((e) => inSubtree(e, current.path));
    const terms = norm(deferred).split(/\s+/).filter(Boolean);
    return base.filter((e) => {
      const hay = norm([e.title, e.username, e.url, e.group, ...e.tags].join(' '));
      return terms.every((t) => hay.includes(t));
    });
  }, [entries, deferred, flat, smartDef, current.path]);

  const smartCounts = useMemo(
    () => Object.fromEntries(SMART.map((x) => [x.id, (entries ?? []).filter(x.test).length])) as Record<SmartId, number>,
    [entries],
  );

  // Carpetas que coinciden con la búsqueda (por nombre), dentro de la carpeta actual
  const matchingFolders = useMemo(() => {
    if (!searching || smartDef) return [];
    const terms = norm(deferred).split(/\s+/).filter(Boolean);
    const out: GroupNode[] = [];
    const walk = (n: GroupNode) =>
      n.children.forEach((c) => {
        if (terms.every((t) => norm(c.name).includes(t))) out.push(c);
        walk(c);
      });
    walk(current);
    return out.slice(0, 12);
  }, [current, deferred, searching, smartDef]);

  const fetchSecret = useCallback(
    (uuid: string) => async (): Promise<Secret> => {
      const s = await api<VaultSecret>('/api/vault/reveal', { method: 'POST', body: { uuid } });
      onChange(); // renueva el temporizador de inactividad mostrado
      return { password: s.password, totp: s.totp?.code ?? null, notes: s.notes, fields: s.fields };
    },
    [onChange],
  );

  // No renueva el temporizador de inactividad (ver entryTotp en el servidor)
  const fetchTotp = useCallback(
    (uuid: string): FetchTotp =>
      () =>
        api<{ totp: Totp | null }>('/api/vault/totp', { method: 'POST', body: { uuid } }).then((r) => r.totp),
    [],
  );


  // --- Edición ---
  const rootGroup = groups[0] ?? '';
  const full = (path: string) => path || rootGroup; // '' en el árbol = carpeta raíz
  const nameOfGroup = (g: string) => (g.includes('/') ? g.split('/').pop()! : tree.name);
  const refresh = useCallback(async () => {
    await onChange();
  }, [onChange]);

  /** Ejecuta una escritura: avisa del resultado y refresca. Relanza el error (para el diálogo). */
  const mutate = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast((e as Error).message, 'err');
      throw e;
    } finally {
      await refresh();
    }
  };

  const newEntryIn = (path: string) => setEditor({ kind: 'new', group: full(path) });
  const newEntry = () => newEntryIn(current.path);

  useEffect(() => {
    if (newRequest) newEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newRequest]);

  const newFolderIn = (node: GroupNode) =>
    setDialog({
      title: 'Nueva carpeta',
      text: (
        <>
          Dentro de <b>{node.name}</b>
        </>
      ),
      icon: 'folderPlus',
      confirmLabel: 'Crear carpeta',
      input: { label: 'Nombre', placeholder: 'Ej.: Bancos' },
      onConfirm: async (name) => {
        if (name.includes('/')) {
          toast('El nombre no puede llevar "/"', 'err');
          throw new Error('nombre');
        }
        await mutate(() => api('/api/vault/groups', { method: 'POST', body: { parent: full(node.path), name } }), `Carpeta "${name}" creada`);
      },
    });

  const deleteFolderNode = (target: GroupNode) => {
    const subs = countFolders(target);
    setDialog({
      title: `¿Eliminar la carpeta "${target.name}"?`,
      text: (
        <>
          {target.count || subs ? (
            <>
              Contiene <b>{target.count}</b> {target.count === 1 ? 'entrada' : 'entradas'}
              {subs > 0 && (
                <>
                  {' '}y <b>{subs}</b> {subs === 1 ? 'subcarpeta' : 'subcarpetas'}
                </>
              )}
              , que se van con ella.{' '}
            </>
          ) : (
            'Está vacía. '
          )}
          Se mueve a la papelera de KeePassXC si está activada.
        </>
      ),
      danger: true,
      confirmLabel: 'Eliminar carpeta',
      onConfirm: async () => {
        await mutate(() => api('/api/vault/groups', { method: 'DELETE', body: { group: target.path } }), `Carpeta "${target.name}" eliminada`);
        // Si estabas dentro de la carpeta borrada, sube a su carpeta padre
        if (current.path === target.path || current.path.startsWith(target.path + '/')) {
          const up = trail(tree, target.path);
          open(up.length > 1 ? up[up.length - 2].path : '');
        }
      },
    });
  };

  // --- Mover entradas (con Deshacer) ---
  const [dragging, setDragging] = useState<VaultEntry | null>(null);
  const [moving, setMoving] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState<VaultEntry | null>(null);

  const patchGroup = (e: VaultEntry, group: string) => api(`/api/vault/entries/${e.uuid}`, { method: 'PATCH', body: { group } });

  const move = async (e: VaultEntry, toGroup: string) => {
    setDragging(null);
    const from = e.group;
    if (toGroup === from) return;
    setMoving((m) => new Set(m).add(e.uuid));
    try {
      await patchGroup(e, toGroup);
      toast(`"${e.title}" movida a ${nameOfGroup(toGroup)}`, 'ok', {
        label: 'Deshacer',
        run: async () => {
          try {
            await patchGroup(e, from);
            toast(`"${e.title}" volvió a ${nameOfGroup(from)}`);
          } catch (err) {
            toast((err as Error).message, 'err');
          } finally {
            await refresh();
          }
        },
      });
    } catch (err) {
      toast((err as Error).message, 'err');
    } finally {
      await refresh();
      setMoving((m) => {
        const n = new Set(m);
        n.delete(e.uuid);
        return n;
      });
    }
  };

  // --- Menús contextuales ---
  const [menuReq, setMenuReq] = useState<(MenuRequest & { alignRight?: boolean }) | null>(null);
  const closeMenu = useCallback(() => setMenuReq(null), []);
  const menu: VaultActions['menu'] = (at, title, items) => setMenuReq({ ...at, title, items });

  const folderMenu: VaultActions['folderMenu'] = (node, at) =>
    menu(at, node.name, [
      { label: 'Abrir', icon: 'folderOpen', onSelect: () => open(node.path) },
      { label: 'Nueva entrada aquí', icon: 'plus', onSelect: () => newEntryIn(node.path) },
      { label: 'Nueva subcarpeta', icon: 'folderPlus', onSelect: () => newFolderIn(node) },
      ...(node.path
        ? (['sep', { label: 'Eliminar carpeta', icon: 'trash', danger: true, onSelect: () => deleteFolderNode(node) }] as MenuItem[])
        : []),
    ]);

  const actions: VaultActions = {
    edit: (e) => setEditor({ kind: 'edit', entry: e }),
    remove: (e) =>
      setDialog({
        title: `¿Eliminar "${e.title || '(sin título)'}"?`,
        text: 'Se mueve a la papelera de KeePassXC si está activada; si no, se borra definitivamente.',
        danger: true,
        confirmLabel: 'Eliminar entrada',
        onConfirm: () => mutate(() => api(`/api/vault/entries/${e.uuid}`, { method: 'DELETE' }), 'Entrada eliminada'),
      }),
    ask: setDialog,
    refresh,
    revision: vault.revision ?? 0,
    entries: entries ?? [],
    open,
    full,
    dragging,
    setDragging,
    moving,
    move,
    pickFolder: setPicking,
    menu,
    folderMenu,
    showDetail: setDetail,
  };

  // Los adjuntos descargados viven en memoria solo mientras la bóveda está abierta
  useEffect(() => clearAttachmentCache, []);

  const lock = async () => {
    await api('/api/vault/lock', { method: 'POST' }).catch(() => {});
    toast('Bóveda cerrada');
    onChange();
  };

  const busy = Boolean(editor || dialog || menuReq || picking || detail);
  useHotkeys({
    backspace: () => !busy && (smart ? setSmart(null) : parent && open(parent.path)),
    escape: () => {
      if (dialog || menuReq) return; // los cierran ellos mismos
      if (picking) setPicking(null);
      else if (editor) setEditor(null);
      else if (detail) setDetail(null);
      else if (query) setQuery('');
      else if (smart) setSmart(null);
    },
    n: () => !busy && newEntry(),
  });

  // --- Teclado: flechas para moverse entre tarjetas y filas ---
  const navRef = useRef<HTMLDivElement>(null);
  const onNavKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!keys.includes(ev.key)) return;
    const cur = (ev.target as HTMLElement).closest<HTMLElement>('[data-nav]');
    if (!cur || !navRef.current) return;
    const items = [...navRef.current.querySelectorAll<HTMLElement>('[data-nav]')];
    const next = nearest(cur, items, ev.key);
    if (next) {
      ev.preventDefault();
      next.focus();
      next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };
  const focusFirst = () => navRef.current?.querySelector<HTMLElement>('[data-nav]')?.focus();

  const left = Math.max(0, Math.round(((vault.expiresAt ?? now) - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  const where = smartDef ? smartDef.label.toLowerCase() : current.path ? current.name : 'toda la bóveda';

  const shortcuts = (at: { x: number; y: number; alignRight?: boolean }) =>
    menu(at, 'Atajos de teclado', [
      { label: 'Buscar', icon: 'search', hint: '/', onSelect: () => (ref as React.RefObject<HTMLInputElement>)?.current?.focus() },
      { label: 'Nueva entrada', icon: 'plus', hint: 'N', onSelect: newEntry },
      { label: 'Carpeta anterior', icon: 'chevronLeft', hint: '⌫', onSelect: () => parent && open(parent.path) },
      { label: 'Moverse por la lista', icon: 'grip', hint: '↑ ↓', onSelect: focusFirst },
      'sep',
      { label: 'Arrastra una entrada a una carpeta para moverla', icon: 'move', onSelect: () => {} },
      { label: 'Clic derecho: más opciones', icon: 'more', onSelect: () => {} },
    ]);

  // Árbol: desplegar/plegar todo
  const [treeSignal, setTreeSignal] = useState({ n: 0, open: true });
  const [folderFilter, setFolderFilter] = useState('');
  const filteredFolders = useMemo(() => {
    const q = norm(folderFilter.trim());
    if (!q) return [];
    const out: GroupNode[] = [];
    const walk = (n: GroupNode) =>
      n.children.forEach((c) => {
        if (norm(c.name).includes(q)) out.push(c);
        walk(c);
      });
    walk(tree);
    return out;
  }, [folderFilter, tree]);

  const idleTotal = Math.max(1, Math.round(vault.idleMs / 1000));
  const detailEntry = detail ? (entries?.find((e) => e.uuid === detail) ?? null) : null;
  const showFolders = flat ? matchingFolders : current.children;
  const shownEntries = visible.slice(0, limit);
  const contentKey = smart ? `smart:${smart}` : searching ? 'search' : current.path;
  const anim = flat ? 'animate-fade-up' : dir === 'in' ? 'animate-slide-in' : dir === 'out' ? 'animate-slide-out' : 'animate-fade-up';

  const more = visible.length > limit && (
    <div className="px-4 py-2.5 text-center">
      <button className="text-sm text-emerald-700 hover:underline dark:text-emerald-400" onClick={() => setLimit((l) => l + PAGE)}>
        Mostrar {Math.min(PAGE, visible.length - limit)} más de {visible.length - limit}
      </button>
    </div>
  );

  return (
    <ActionsCtx.Provider value={actions}>
      <TreeSignalCtx.Provider value={treeSignal}>
        <div className="flex min-h-[calc(100dvh-3.5rem)]">
          {/* ---------------- Barra lateral ---------------- */}
          <aside
            className={`sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 flex-col border-r border-zinc-200/80 bg-white/40 dark:border-white/[0.06] dark:bg-white/[0.01] ${
              sidebar ? 'lg:flex' : ''
            }`}
          >
            {/* Bóveda */}
            <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Icon name="unlock" className="size-4" />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold" title={vault.dbPath}>
                  {vault.name}
                </p>
                <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  {vault.count} entradas · {countFolders(tree)} carpetas
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {/* Vistas rápidas */}
              <div className="mt-1 space-y-px">
                {SMART.filter((x) => x.id !== 'expired' || smartCounts.expired > 0).map((x) => (
                  <SideItem
                    key={x.id}
                    icon={x.icon}
                    label={x.label}
                    count={smartCounts[x.id]}
                    active={smart === x.id}
                    tone={x.id === 'expired' ? 'danger' : undefined}
                    onClick={() => openSmart(x.id)}
                  />
                ))}
              </div>

              {/* Carpetas */}
              <div className="mt-4 mb-1 flex h-6 items-center gap-1 pl-2.5">
                <span className="flex-1 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">Carpetas</span>
                <button
                  className="btn-icon size-6 rounded-md"
                  onClick={() => setTreeSignal((x) => ({ n: x.n + 1, open: true }))}
                  title="Desplegar todo"
                  aria-label="Desplegar todas las carpetas"
                >
                  <Icon name="expandAll" className="size-3.5" />
                </button>
                <button
                  className="btn-icon size-6 rounded-md"
                  onClick={() => setTreeSignal((x) => ({ n: x.n + 1, open: false }))}
                  title="Plegar todo"
                  aria-label="Plegar todas las carpetas"
                >
                  <Icon name="collapseAll" className="size-3.5" />
                </button>
                <button className="btn-icon size-6 rounded-md" onClick={() => newFolderIn(current)} title="Nueva carpeta aquí" aria-label="Nueva carpeta">
                  <Icon name="plus" className="size-3.5" />
                </button>
              </div>
              <label className="mb-1.5 flex h-7 items-center gap-1.5 rounded-md bg-zinc-900/[0.04] px-2 text-[13px] focus-within:ring-2 focus-within:ring-emerald-400/30 dark:bg-white/[0.05]">
                <Icon name="search" className="size-3.5 shrink-0 text-zinc-400" />
                <input
                  value={folderFilter}
                  onChange={(e) => setFolderFilter(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setFolderFilter(''))}
                  placeholder="Filtrar carpetas"
                  aria-label="Filtrar carpetas"
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-400"
                />
                {folderFilter && (
                  <button onClick={() => setFolderFilter('')} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" aria-label="Limpiar filtro">
                    <Icon name="x" className="size-3" />
                  </button>
                )}
              </label>

              <nav aria-label="Carpetas">
                {folderFilter ? (
                  filteredFolders.length ? (
                    filteredFolders.map((f) => (
                      <SideItem
                        key={f.path}
                        icon="folder"
                        label={f.name}
                        sub={prettyGroup(f.path).split(' / ').slice(0, -1).join(' / ') || undefined}
                        count={f.count}
                        active={!smart && current.path === f.path}
                        onClick={() => {
                          open(f.path);
                          setFolderFilter('');
                        }}
                      />
                    ))
                  ) : (
                    <p className="px-2.5 py-3 text-xs text-zinc-400">Ninguna carpeta coincide.</p>
                  )
                ) : (
                  <FolderTree node={tree} active={smart ? '\u0000' : current.path} depth={0} />
                )}
              </nav>
            </div>

            {/* Inactividad + cerrar */}
            <div className="border-t border-zinc-200/80 px-3 py-2.5 dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Icon name="clock" className={`size-3.5 ${left < 60 ? 'text-rose-500' : 'text-zinc-400'}`} />
                <span className="flex-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Se cierra en <b className={`font-semibold tabular-nums ${left < 60 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-700 dark:text-zinc-200'}`}>{mm}:{ss}</b>
                </span>
                <button className="btn-soft h-7 px-2 text-xs" onClick={lock} title="Cerrar la bóveda ahora">
                  <Icon name="lock" className="size-3.5" /> Cerrar
                </button>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-900/5 dark:bg-white/10">
                <div
                  className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${left < 60 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, (left / idleTotal) * 100)}%` }}
                />
              </div>
            </div>
          </aside>

          {/* ---------------- Contenido ---------------- */}
          <section className="min-w-0 flex-1 pb-10 lg:px-6">
            {/* Bóveda (móvil) */}
            <div className="flex items-center gap-2 py-3 lg:hidden">
              <Icon name="unlock" className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{vault.name}</span>
              <span className={`text-xs tabular-nums ${left < 60 ? 'text-rose-600' : 'text-zinc-500'}`}>
                {mm}:{ss}
              </span>
              <button className="btn-icon size-8" onClick={lock} aria-label="Cerrar la bóveda">
                <Icon name="lock" />
              </button>
            </div>

            {/* Barra de herramientas */}
            <div className="sticky top-14 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-zinc-200/80 bg-zinc-50/90 px-4 py-2.5 backdrop-blur-xl lg:-mx-6 lg:px-6 dark:border-white/[0.06] dark:bg-zinc-950/90">
              <button
                className={`btn-icon size-8 shrink-0 max-lg:hidden ${sidebar ? '' : 'text-emerald-600 dark:text-emerald-400'}`}
                onClick={() => setSidebar(!sidebar)}
                title={sidebar ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
                aria-label={sidebar ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
              >
                <Icon name="sidebar" className="size-[18px]" />
              </button>
              <button
                className="btn-icon size-8 shrink-0"
                onClick={() => (smart ? setSmart(null) : parent && open(parent.path))}
                disabled={!smart && !parent}
                title="Atrás (⌫)"
                aria-label="Atrás"
              >
                <Icon name="chevronLeft" className="size-[18px]" />
              </button>
              <ol className="flex min-w-0 flex-1 items-center overflow-x-auto text-sm whitespace-nowrap">
                {smartDef ? (
                  <li className="flex items-center gap-1.5 font-semibold">
                    <Icon name={smartDef.icon} className="size-4 text-emerald-600 dark:text-emerald-400" />
                    {smartDef.label}
                    <span className="font-normal text-zinc-400">· toda la bóveda</span>
                  </li>
                ) : (
                  crumbs.map((c, i) => <Crumb key={c.path} node={c} first={i === 0} last={i === crumbs.length - 1} />)
                )}
              </ol>

              <label className="order-last flex h-8 w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm transition focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-400/20 sm:order-none sm:w-56 xl:w-72 dark:border-white/10 dark:bg-zinc-900">
                <Icon name="search" className="size-4 shrink-0 text-zinc-400" />
                <input
                  ref={ref}
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'ArrowDown' && (e.preventDefault(), focusFirst())}
                  placeholder={`Buscar en ${where}`}
                  aria-label="Buscar"
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-400"
                />
                {query ? (
                  <button className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">
                    <Icon name="x" className="size-3.5" />
                  </button>
                ) : (
                  <span className="kbd max-sm:hidden">/</span>
                )}
              </label>

              {/* Lista / cuadrícula */}
              <div role="radiogroup" aria-label="Vista" className="inline-flex h-8 items-center rounded-lg bg-zinc-900/[0.05] p-0.5 dark:bg-white/[0.06]">
                {(
                  [
                    ['list', 'list', 'Lista'],
                    ['grid', 'grid', 'Cuadrícula'],
                  ] as const
                ).map(([id, icon, label]) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={view === id}
                    onClick={() => setView(id)}
                    title={label}
                    aria-label={label}
                    className={`grid h-7 w-8 place-items-center rounded-md transition ${
                      view === id
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                    }`}
                  >
                    <Icon name={icon} className="size-4" />
                  </button>
                ))}
              </div>

              <button className="btn-icon size-8" onClick={() => newFolderIn(current)} title="Nueva carpeta" aria-label="Nueva carpeta">
                <Icon name="folderPlus" className="size-[18px]" />
              </button>
              <button className="btn-primary h-8 px-3 shadow-none" onClick={newEntry} title="Nueva entrada (N)">
                <Icon name="plus" /> <span className="max-sm:hidden">Nueva entrada</span>
              </button>
              <button
                className="btn-icon size-8"
                onClick={(ev) => folderMenu(current, menuAt(ev))}
                title="Opciones de la carpeta"
                aria-label="Opciones de la carpeta"
              >
                <Icon name="more" className="size-[18px]" />
              </button>
              <button className="btn-icon size-8 max-lg:hidden" onClick={(ev) => shortcuts(menuAt(ev))} title="Atajos de teclado" aria-label="Atajos de teclado">
                <span className="text-sm font-semibold">?</span>
              </button>
            </div>

            {/* Resumen de la búsqueda */}
            {searching && entries && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-sm text-zinc-500 dark:text-zinc-400">
                <span>
                  <b className="font-semibold text-zinc-900 tabular-nums dark:text-white">{visible.length + matchingFolders.length}</b>{' '}
                  {visible.length + matchingFolders.length === 1 ? 'resultado' : 'resultados'} en {where}
                </span>
                {current.path && !smart && (
                  <button className="text-emerald-700 hover:underline dark:text-emerald-400" onClick={() => setFolder('')}>
                    Buscar en toda la bóveda
                  </button>
                )}
              </div>
            )}

            <div ref={navRef} onKeyDown={onNavKey} className="pt-3">
              {!entries ? (
                <ListFrame>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="skeleton size-7 rounded-lg" />
                      <div className="skeleton h-3.5 w-1/4" />
                      <div className="skeleton ml-auto h-3 w-1/6" />
                    </li>
                  ))}
                </ListFrame>
              ) : flat && visible.length === 0 && matchingFolders.length === 0 ? (
                <ListFrame>
                  <EmptyState
                    icon={smartDef?.icon ?? 'search'}
                    title={searching ? 'Sin coincidencias' : 'No hay entradas aquí'}
                    text={searching ? 'Prueba con otra palabra o busca en toda la bóveda.' : 'Ninguna entrada cumple esta condición.'}
                  />
                </ListFrame>
              ) : !flat && visible.length === 0 && current.children.length === 0 ? (
                <ListFrame>
                  <EmptyFolder node={current} onNew={newEntry} onNewFolder={() => newFolderIn(current)} />
                </ListFrame>
              ) : view === 'list' ? (
                <div key={contentKey} className={anim}>
                  <ListFrame header>
                    {showFolders.map((f) => (
                      <FolderRow key={f.path} node={f} showPath={flat} />
                    ))}
                    {shownEntries.map((e) => (
                      <EntryRow key={e.uuid} entry={e} fetchSecret={fetchSecret(e.uuid)} fetchTotp={fetchTotp(e.uuid)} showPath={flat} />
                    ))}
                    {more && <li>{more}</li>}
                  </ListFrame>
                </div>
              ) : (
                <div key={contentKey} className={`space-y-6 ${anim}`}>
                  {showFolders.length > 0 && (
                    <div>
                      <GridLabel label="Carpetas" count={showFolders.length} />
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2.5">
                        {showFolders.map((f) => (
                          <FolderCard key={f.path} node={f} showPath={flat} />
                        ))}
                      </div>
                    </div>
                  )}
                  {shownEntries.length > 0 && (
                    <div>
                      <GridLabel label="Entradas" count={visible.length} />
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-2.5">
                        {shownEntries.map((e) => (
                          <EntryTile key={e.uuid} entry={e} fetchSecret={fetchSecret(e.uuid)} fetchTotp={fetchTotp(e.uuid)} showPath={flat} />
                        ))}
                      </div>
                      {more}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </TreeSignalCtx.Provider>

      {/* Aviso flotante mientras se arrastra una entrada */}
      {dragging && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex animate-toast items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-2xl dark:bg-white dark:text-zinc-900">
            <Icon name="move" className="size-4" />
            Suelta <b className="max-w-48 truncate">{dragging.title}</b> sobre una carpeta
          </div>
        </div>
      )}

      {/* Panel de detalle (vista cuadrícula) */}
      <Drawer
        open={Boolean(detailEntry)}
        title={detailEntry?.title || 'Entrada'}
        subtitle={detailEntry ? prettyGroup(detailEntry.group) || 'Inicio' : undefined}
        icon="key"
        width="max-w-xl"
        onClose={() => setDetail(null)}
      >
        {detailEntry && (
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <DetailPanel key={detailEntry.uuid} entry={detailEntry} fetchSecret={fetchSecret(detailEntry.uuid)} fetchTotp={fetchTotp(detailEntry.uuid)} />
          </div>
        )}
      </Drawer>

      <VaultEntryDrawer mode={editor} groups={groups} rootName={tree.name} onClose={() => setEditor(null)} onSaved={refresh} />
      <Dialog request={dialog} onClose={() => setDialog(null)} />
      <ContextMenu request={menuReq} onClose={closeMenu} />
      {picking && (
        <FolderPicker
          entry={picking}
          groups={groups}
          rootName={tree.name}
          onPick={(g) => {
            setPicking(null);
            move(picking, g);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </ActionsCtx.Provider>
  );
});

const TreeSignalCtx = createContext({ n: 0, open: true });

function SideItem({
  icon,
  label,
  sub,
  count,
  active,
  tone,
  onClick,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  count?: number;
  active?: boolean;
  tone?: 'danger';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={sub ? `${sub} / ${label}` : label}
      className={`flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-[13px] transition-colors ${
        active
          ? 'bg-emerald-500/10 font-medium text-emerald-800 dark:text-emerald-300'
          : 'text-zinc-600 hover:bg-zinc-900/[0.04] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100'
      }`}
    >
      <Icon
        name={icon}
        className={`size-4 shrink-0 ${
          tone === 'danger' ? 'text-rose-500' : active ? 'text-emerald-600 dark:text-emerald-400' : icon === 'folder' ? 'text-amber-500' : 'text-zinc-400'
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className="block truncate text-[11px] text-zinc-400">{sub}</span>}
      </span>
      {count !== undefined && <span className="text-[11px] tabular-nums opacity-50">{count}</span>}
    </button>
  );
}

function GridLabel({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 px-0.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
      {label} <span className="font-normal tabular-nums">{count}</span>
    </h3>
  );
}

// --- Lista con columnas -----------------------------------------------------------
// Nombre · Usuario · Sitio · Código 2FA · acciones (en móvil: nombre + acciones)
const COLS = 'md:grid md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)_8.25rem_6.5rem] md:items-center md:gap-4';

function ListFrame({ header, children }: { header?: boolean; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white dark:border-white/[0.07] dark:bg-zinc-900/50">
      {header && (
        <div className={`hidden border-b border-zinc-200/80 bg-zinc-50/80 px-4 py-2 text-[11px] font-medium tracking-wide text-zinc-500 uppercase dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-400 ${COLS}`}>
          <span>Nombre</span>
          <span>Usuario</span>
          <span>Sitio</span>
          <span>Código</span>
          <span />
        </div>
      )}
      <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.05]">{children}</ul>
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <li className="px-6 py-12 text-center">
      <Icon name={icon} className="mx-auto mb-3 size-6 text-zinc-400" />
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{text}</p>
    </li>
  );
}

/** Carpeta vacía: invita a crear algo o a soltar una entrada aquí. */
function EmptyFolder({ node, onNew, onNewFolder }: { node: GroupNode; onNew: () => void; onNewFolder: () => void }) {
  const drop = useDropTarget(node.path);
  return (
    <li
      {...drop.props}
      className={`m-3 rounded-lg border border-dashed px-6 py-10 text-center transition ${
        drop.over ? 'border-emerald-500 bg-emerald-500/10' : drop.active ? 'border-emerald-400/70 bg-emerald-500/5' : 'border-zinc-300 dark:border-white/10'
      }`}
    >
      <Icon name="folderOpen" className={`mx-auto mb-3 size-7 text-amber-500 ${drop.over ? 'animate-wiggle' : ''}`} />
      <p className="font-medium">{drop.active ? 'Suelta aquí para moverla' : 'Esta carpeta está vacía'}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Crea una entrada o subcarpeta, o arrastra aquí una entrada.</p>
      <div className="mt-4 flex justify-center gap-2">
        <button className="btn-primary h-8 px-3 shadow-none" onClick={onNew}>
          <Icon name="plus" /> Nueva entrada
        </button>
        <button className="btn-soft h-8 px-3" onClick={onNewFolder}>
          <Icon name="folderPlus" /> Subcarpeta
        </button>
      </div>
    </li>
  );
}

function Crumb({ node, first, last }: { node: GroupNode; first: boolean; last: boolean }) {
  const a = useContext(ActionsCtx)!;
  const drop = useDropTarget(node.path);
  return (
    <li className="flex shrink-0 items-center">
      {!first && <Icon name="chevronRight" className="mx-0.5 size-3.5 text-zinc-300 dark:text-zinc-600" />}
      <button
        {...drop.props}
        onClick={() => a.open(node.path)}
        onContextMenu={(ev) => {
          ev.preventDefault();
          a.folderMenu(node, menuAt(ev));
        }}
        aria-current={last ? 'page' : undefined}
        className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition ${
          drop.over
            ? 'bg-emerald-500 text-white'
            : drop.active
              ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-400/50 dark:text-emerald-400'
              : last
                ? 'font-semibold text-zinc-900 dark:text-white'
                : 'text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white'
        }`}
      >
        {first && <Icon name="home" className="size-4" />}
        <span className={first ? 'max-sm:hidden' : ''}>{node.name}</span>
      </button>
    </li>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Fila de carpeta: abre al pulsar; acepta entradas soltadas encima. */
function FolderRow({ node: f, showPath }: { node: GroupNode; showPath?: boolean }) {
  const a = useContext(ActionsCtx)!;
  const drop = useDropTarget(f.path);
  const summary = [f.children.length ? plural(f.children.length, 'carpeta', 'carpetas') : '', plural(f.count, 'entrada', 'entradas')]
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      {...drop.props}
      onContextMenu={(ev) => {
        ev.preventDefault();
        a.folderMenu(f, menuAt(ev));
      }}
      className={`group relative transition-colors ${
        drop.over
          ? 'bg-emerald-500/10 shadow-[inset_3px_0_0] shadow-emerald-500'
          : drop.active
            ? 'bg-emerald-500/[0.03]'
            : 'hover:bg-zinc-50 dark:hover:bg-white/[0.03]'
      }`}
    >
      <div className={`flex items-center gap-3 px-4 py-2 ${COLS}`}>
        <button
          data-nav
          onClick={() => a.open(f.path)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <span className="grid size-7 shrink-0 place-items-center text-amber-500">
            {drop.over ? (
              <Icon name="folderOpen" className="size-5 animate-wiggle" />
            ) : (
              <>
                <Icon name="folder" className="size-5 group-hover:hidden" fill="currentColor" fillOpacity={0.2} />
                <Icon name="folderOpen" className="hidden size-5 group-hover:block" />
              </>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{f.name}</span>
            <span className="block truncate text-xs text-zinc-500 md:hidden dark:text-zinc-400">{summary}</span>
            {showPath && <span className="block truncate text-xs text-zinc-400 max-md:hidden">{prettyGroup(f.path)}</span>}
          </span>
        </button>
        <span className="hidden truncate text-sm text-zinc-500 md:block dark:text-zinc-400">{summary}</span>
        <span className="hidden md:block" />
        <span className={`hidden text-xs md:block ${drop.over ? 'font-medium text-emerald-700 dark:text-emerald-400' : ''}`}>
          {drop.over ? 'Mover aquí' : ''}
        </span>
        <span className="flex shrink-0 items-center justify-end gap-0.5">
          <button
            onClick={(ev) => a.folderMenu(f, menuAt(ev))}
            className="btn-icon size-8 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
            aria-label={`Opciones de ${f.name}`}
            title="Opciones"
          >
            <Icon name="more" />
          </button>
          <Icon name="chevronRight" className="size-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500 dark:text-zinc-600" />
        </span>
      </div>
    </li>
  );
}


function nearest(cur: HTMLElement, items: HTMLElement[], key: string) {
  const c = cur.getBoundingClientRect();
  const cx = c.left + c.width / 2;
  const cy = c.top + c.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    const ok =
      key === 'ArrowDown' ? dy > 4 : key === 'ArrowUp' ? dy < -4 : key === 'ArrowRight' ? dx > 4 && Math.abs(dy) < c.height / 2 : dx < -4 && Math.abs(dy) < c.height / 2;
    if (!ok) continue;
    // Penaliza el desvío en el eje perpendicular
    const score = key === 'ArrowDown' || key === 'ArrowUp' ? Math.abs(dy) + Math.abs(dx) * 2 : Math.abs(dx) + Math.abs(dy) * 2;
    if (score < bestScore) (bestScore = score), (best = el);
  }
  // En una lista de una columna, ← → pasan a la anterior/siguiente
  if (!best && (key === 'ArrowLeft' || key === 'ArrowRight')) best = items[items.indexOf(cur) + (key === 'ArrowRight' ? 1 : -1)] ?? null;
  return best;
}

const countFolders = (n: GroupNode): number => n.children.reduce((acc, c) => acc + 1 + countFolders(c), 0);

function useDropTarget(path: string) {
  const a = useContext(ActionsCtx)!;
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const accepts = Boolean(a.dragging && a.full(path) !== a.dragging.group);

  useEffect(() => {
    if (!a.dragging) (depth.current = 0), setOver(false);
  }, [a.dragging]);

  return {
    over: over && accepts,
    active: accepts,
    props: {
      onDragEnter: (ev: DragEvent) => {
        if (!a.dragging) return;
        ev.preventDefault();
        depth.current++;
        setOver(true);
      },
      onDragOver: (ev: DragEvent) => {
        if (!a.dragging) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = accepts ? 'move' : 'none';
      },
      onDragLeave: () => {
        if (--depth.current <= 0) (depth.current = 0), setOver(false);
      },
      onDrop: (ev: DragEvent) => {
        ev.preventDefault();
        depth.current = 0;
        setOver(false);
        if (accepts && a.dragging) a.move(a.dragging, a.full(path));
      },
    },
  };
}

function dragGhost(ev: DragEvent, title: string) {
  const el = document.createElement('div');
  el.textContent = `🔑 ${title}`;
  el.style.cssText =
    'position:fixed;top:-100px;left:0;padding:8px 14px;border-radius:12px;background:#10b981;color:#fff;font:600 13px Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgb(0 0 0/.25);white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis';
  document.body.appendChild(el);
  ev.dataTransfer.setDragImage(el, 16, 16);
  window.setTimeout(() => el.remove(), 0);
}


const toCard = (e: VaultEntry): CardEntry => ({
  uuid: e.uuid,
  name: e.title,
  login: e.username,
  url: e.url,
  group: prettyGroup(e.group) || undefined,
  hasTotp: e.hasTotp,
  expired: e.expired,
  hasNotes: e.hasNotes,
  hasFields: e.fieldNames.length > 0,
});

/**
 * Lo común a una entrada en lista y en cuadrícula: secreto, menú contextual y arrastre.
 * `primary` es la acción principal del menú (desplegar en la lista, abrir panel en la cuadrícula).
 */
function useEntryActions(
  e: VaultEntry,
  fetchSecret: () => Promise<Secret>,
  fetchTotp: FetchTotp,
  showPath: boolean | undefined,
  primary: { label: string; icon: IconName; run: () => void },
  draggableNow: boolean,
) {
  const toast = useToast();
  const a = useContext(ActionsCtx)!;
  const card = toCard(e);
  const state = useEntrySecret(card, fetchSecret);
  const isMoving = a.moving.has(e.uuid);
  const isDragging = a.dragging?.uuid === e.uuid;
  const groupPath = e.group.includes('/') ? e.group : '';

  // Los errores ya se muestran en un aviso
  const quiet = (fn: () => Promise<unknown>) => () => void fn().catch(() => {});

  const copyTotp = async () => {
    try {
      const t = await fetchTotp();
      if (!t) throw new Error('Esta entrada no tiene TOTP');
      await copyText(t.code);
      toast('Código copiado · se borra en 30 s');
    } catch (err) {
      toast((err as Error).message, 'err');
    }
  };

  const openMenu = (at: { x: number; y: number; alignRight?: boolean }) =>
    a.menu(at, e.title || '(sin título)', [
      { label: primary.label, icon: primary.icon, onSelect: primary.run },
      'sep',
      { label: 'Copiar usuario', icon: 'user', disabled: !e.username, onSelect: quiet(state.copy('login')) },
      { label: 'Copiar contraseña', icon: 'copy', onSelect: quiet(state.copy('password')) },
      ...(e.hasTotp ? [{ label: 'Copiar código TOTP', icon: 'clock' as const, onSelect: copyTotp }] : []),
      ...(e.url ? [{ label: 'Abrir sitio', icon: 'external' as const, onSelect: () => window.open(hrefOf(e.url), '_blank', 'noopener,noreferrer') }] : []),
      'sep',
      { label: 'Editar', icon: 'pencil', onSelect: () => a.edit(e) },
      { label: 'Mover a…', icon: 'move', onSelect: () => a.pickFolder(e) },
      ...(showPath ? [{ label: 'Ir a su carpeta', icon: 'folderOpen' as const, onSelect: () => a.open(groupPath) }] : []),
      'sep',
      { label: 'Eliminar', icon: 'trash', danger: true, onSelect: () => a.remove(e) },
    ]);

  const itemProps = {
    draggable: draggableNow && !isMoving,
    onDragStart: (ev: DragEvent) => {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', e.title);
      dragGhost(ev, e.title || '(sin título)');
      // Diferido: si el estado cambia en el mismo tick, algunos navegadores cancelan el arrastre
      window.setTimeout(() => a.setDragging(e), 0);
    },
    onDragEnd: () => a.setDragging(null),
    onContextMenu: (ev: React.MouseEvent) => {
      if ((ev.target as HTMLElement).closest('input, textarea, a')) return;
      ev.preventDefault();
      openMenu(menuAt(ev));
    },
  };

  return { a, card, state, isMoving, isDragging, groupPath, openMenu, itemProps };
}

/** Badges junto al título: expirada y adjuntos. */
function EntryBadges({ e }: { e: VaultEntry }) {
  return (
    <>
      {e.expired && (
        <span className="shrink-0 rounded bg-rose-500/10 px-1.5 text-[10px] font-semibold tracking-wide text-rose-600 uppercase dark:text-rose-400">
          Expirada
        </span>
      )}
      {e.attachments.length > 0 && (
        <span title={plural(e.attachments.length, 'adjunto', 'adjuntos')} className="inline-flex shrink-0 items-center text-zinc-400">
          <Icon name="paperclip" className="size-3.5" />
          {e.attachments.length > 1 && <span className="text-[11px]">{e.attachments.length}</span>}
        </span>
      )}
    </>
  );
}

/** Detalle de una entrada: datos, contraseña/TOTP/notas, adjuntos y acciones. */
function EntryDetail({
  e,
  card,
  state,
  fetchTotp,
  columns,
}: {
  e: VaultEntry;
  card: CardEntry;
  state: EntrySecretState;
  fetchTotp: FetchTotp;
  columns?: boolean;
}) {
  const a = useContext(ActionsCtx)!;
  const groupPath = e.group.includes('/') ? e.group : '';
  return (
    <>
      <div className={`grid gap-4 ${columns ? 'xl:grid-cols-2' : ''}`}>
        <div className="min-w-0 space-y-3">
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-zinc-500 dark:text-zinc-400">Usuario</dt>
            <dd className="min-w-0 truncate">{e.username || '—'}</dd>
            {e.url && (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Sitio</dt>
                <dd className="min-w-0 truncate">
                  <a href={hrefOf(e.url)} target="_blank" rel="noreferrer noopener" className="text-emerald-700 hover:underline dark:text-emerald-400">
                    {e.url}
                  </a>
                </dd>
              </>
            )}
            <dt className="text-zinc-500 dark:text-zinc-400">Carpeta</dt>
            <dd className="min-w-0 truncate">
              <button
                className="hover:underline"
                onClick={() => {
                  a.showDetail('');
                  a.open(groupPath);
                }}
              >
                {prettyGroup(e.group) || 'Inicio'}
              </button>
            </dd>
            {e.tags.length > 0 && (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Etiquetas</dt>
                <dd className="flex flex-wrap gap-1">
                  {e.tags.map((t) => (
                    <span key={t} className="rounded bg-emerald-500/10 px-1.5 py-px text-xs text-emerald-700 dark:text-emerald-400">
                      {t}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </dl>
          <SecretBody entry={card} state={state} fetchTotp={fetchTotp} />
        </div>
        <div className="min-w-0">
          <Attachments uuid={e.uuid} files={e.attachments} version={a.revision} onChanged={a.refresh} ask={a.ask} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button className="btn-soft h-8 px-3" onClick={() => a.edit(e)}>
          <Icon name="pencil" /> Editar
        </button>
        <button className="btn-soft h-8 px-3" onClick={() => a.pickFolder(e)}>
          <Icon name="move" /> Mover a…
        </button>
        <button className="btn-soft h-8 px-3 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400" onClick={() => a.remove(e)}>
          <Icon name="trash" /> Eliminar
        </button>
      </div>
    </>
  );
}

/** Contenido del panel lateral de detalle (vista cuadrícula). */
function DetailPanel({ entry: e, fetchSecret, fetchTotp }: { entry: VaultEntry; fetchSecret: () => Promise<Secret>; fetchTotp: FetchTotp }) {
  const card = toCard(e);
  const state = useEntrySecret(card, fetchSecret);
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={e.title || e.url || '?'} size="size-11" />
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="truncate font-semibold">{e.title || '(sin título)'}</span>
            <EntryBadges e={e} />
          </p>
          {e.url && <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{hostOf(e.url)}</p>}
        </div>
      </div>
      <EntryDetail e={e} card={card} state={state} fetchTotp={fetchTotp} />
    </>
  );
}

// --- Vista lista: fila desplegable ----------------------------------------------------
function EntryRow({
  entry: e,
  fetchSecret,
  fetchTotp,
  showPath,
}: {
  entry: VaultEntry;
  fetchSecret: () => Promise<Secret>;
  fetchTotp: FetchTotp;
  showPath?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => {
    if (expanded) x.state.hide(); // al plegar, oculta el secreto
    setExpanded(!expanded);
  };
  const x = useEntryActions(
    e,
    fetchSecret,
    fetchTotp,
    showPath,
    { label: expanded ? 'Plegar' : 'Ver detalles', icon: expanded ? 'chevronLeft' : 'eye', run: toggle },
    !expanded,
  );

  return (
    <li
      {...x.itemProps}
      className={`group/row relative transition-colors ${
        expanded ? 'bg-zinc-50/80 shadow-[inset_3px_0_0] shadow-emerald-500 dark:bg-white/[0.03]' : 'hover:bg-zinc-50 dark:hover:bg-white/[0.03]'
      } ${x.isDragging ? 'opacity-40' : ''} ${x.isMoving ? 'pointer-events-none opacity-50' : ''}`}
    >
      {x.isMoving && (
        <span className="absolute inset-y-0 right-4 z-10 flex items-center gap-2 text-xs font-medium text-zinc-500">
          <Icon name="loader" /> Moviendo…
        </span>
      )}

      <div className={`flex items-center gap-3 px-4 py-2 ${COLS}`}>
        {/* Nombre */}
        <button
          data-nav
          onClick={toggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <Avatar name={e.title || e.url || '?'} size="size-7" text="text-xs" className="rounded-lg! shadow-none!" />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{e.title || '(sin título)'}</span>
              <EntryBadges e={e} />
            </span>
            {/* En móvil, usuario y sitio van debajo del nombre */}
            <span className="block truncate text-xs text-zinc-500 md:hidden dark:text-zinc-400">
              {[e.username, e.url && hostOf(e.url)].filter(Boolean).join(' · ') || 'Sin usuario'}
            </span>
            {showPath && (
              <span className="block truncate text-xs text-zinc-400 max-md:hidden">
                <Icon name="folder" className="mr-1 inline size-3 align-[-1px]" />
                {prettyGroup(e.group) || 'Inicio'}
              </span>
            )}
          </span>
        </button>

        {/* Usuario */}
        <span className="hidden min-w-0 truncate text-sm text-zinc-600 md:block dark:text-zinc-300" title={e.username}>
          {e.username || <span className="text-zinc-300 dark:text-zinc-600">—</span>}
        </span>

        {/* Sitio */}
        <span className="hidden min-w-0 md:block">
          {e.url ? (
            <a
              href={hrefOf(e.url)}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(ev) => ev.stopPropagation()}
              className="block truncate text-sm text-zinc-500 hover:text-emerald-700 hover:underline dark:text-zinc-400 dark:hover:text-emerald-400"
              title={e.url}
            >
              {hostOf(e.url)}
            </a>
          ) : (
            <span className="text-sm text-zinc-300 dark:text-zinc-600">—</span>
          )}
        </span>

        {/* Código 2FA en vivo */}
        <span className="shrink-0 md:block">{e.hasTotp && <TotpChip fetchTotp={fetchTotp} />}</span>

        {/* Acciones (en escritorio aparecen al pasar el ratón) */}
        <span className="flex shrink-0 items-center justify-end">
          <span className="flex items-center transition md:opacity-0 md:group-focus-within/row:opacity-100 md:group-hover/row:opacity-100">
            <span className="hidden sm:contents">
              <ActionButton icon="user" label="Copiar usuario" onClick={x.state.copy('login')} disabled={!e.username} />
            </span>
            <ActionButton icon="copy" label="Copiar contraseña" onClick={x.state.copy('password')} />
          </span>
          <button className="btn-icon size-8" onClick={(ev) => x.openMenu(menuAt(ev))} aria-label="Más opciones" title="Más opciones">
            <Icon name="more" />
          </button>
        </span>
      </div>

      {/* Detalle desplegable */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          {expanded && (
            <div className="animate-fade-up px-4 pt-1 pb-4 md:pl-14">
              <EntryDetail e={e} card={x.card} state={x.state} fetchTotp={fetchTotp} columns />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// --- Vista cuadrícula: tarjetas -------------------------------------------------------
function EntryTile({
  entry: e,
  fetchSecret,
  fetchTotp,
  showPath,
}: {
  entry: VaultEntry;
  fetchSecret: () => Promise<Secret>;
  fetchTotp: FetchTotp;
  showPath?: boolean;
}) {
  const a = useContext(ActionsCtx)!;
  const openDetail = () => a.showDetail(e.uuid);
  const x = useEntryActions(e, fetchSecret, fetchTotp, showPath, { label: 'Ver detalles', icon: 'eye', run: openDetail }, true);

  return (
    <div
      {...x.itemProps}
      className={`group/tile relative flex flex-col rounded-xl border border-zinc-200/80 bg-white transition hover:border-zinc-300 hover:shadow-md hover:shadow-zinc-900/5 dark:border-white/[0.07] dark:bg-zinc-900/50 dark:hover:border-white/15 ${
        x.isDragging ? 'opacity-40' : ''
      } ${x.isMoving ? 'pointer-events-none opacity-50' : ''}`}
    >
      <button
        data-nav
        onClick={openDetail}
        className="flex min-w-0 items-start gap-3 rounded-t-xl p-3 pb-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        <Avatar name={e.title || e.url || '?'} size="size-9" text="text-sm" className="rounded-lg! shadow-none!" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{e.title || '(sin título)'}</span>
            <EntryBadges e={e} />
          </span>
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{e.username || 'Sin usuario'}</span>
          <span className="block truncate text-xs text-zinc-400">
            {showPath ? (
              <>
                <Icon name="folder" className="mr-1 inline size-3 align-[-1px]" />
                {prettyGroup(e.group) || 'Inicio'}
              </>
            ) : e.url ? (
              hostOf(e.url)
            ) : (
              ' '
            )}
          </span>
        </span>
      </button>

      <div className="mt-auto flex h-11 items-center gap-1 border-t border-zinc-200/70 px-2 dark:border-white/[0.05]">
        <span className="min-w-0 flex-1">{e.hasTotp && <TotpChip fetchTotp={fetchTotp} />}</span>
        <span className="flex items-center transition sm:opacity-0 sm:group-focus-within/tile:opacity-100 sm:group-hover/tile:opacity-100">
          <ActionButton icon="user" label="Copiar usuario" onClick={x.state.copy('login')} disabled={!e.username} />
          <ActionButton icon="copy" label="Copiar contraseña" onClick={x.state.copy('password')} />
        </span>
        <button className="btn-icon size-8" onClick={(ev) => x.openMenu(menuAt(ev))} aria-label="Más opciones" title="Más opciones">
          <Icon name="more" />
        </button>
      </div>

      {x.isMoving && (
        <span className="absolute inset-0 grid place-items-center rounded-xl bg-white/50 text-xs font-medium dark:bg-zinc-900/50">
          <span className="flex items-center gap-2">
            <Icon name="loader" /> Moviendo…
          </span>
        </span>
      )}
    </div>
  );
}

function FolderCard({ node: f, showPath }: { node: GroupNode; showPath?: boolean }) {
  const a = useContext(ActionsCtx)!;
  const drop = useDropTarget(f.path);
  const summary = [f.children.length ? plural(f.children.length, 'carpeta', 'carpetas') : '', plural(f.count, 'entrada', 'entradas')]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      {...drop.props}
      onContextMenu={(ev) => {
        ev.preventDefault();
        a.folderMenu(f, menuAt(ev));
      }}
      className={`group relative rounded-xl border transition ${
        drop.over
          ? 'scale-[1.02] border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
          : drop.active
            ? 'border-dashed border-emerald-400/70 bg-white dark:bg-zinc-900/50'
            : 'border-zinc-200/80 bg-white hover:border-zinc-300 hover:shadow-md hover:shadow-zinc-900/5 dark:border-white/[0.07] dark:bg-zinc-900/50 dark:hover:border-white/15'
      }`}
    >
      <button
        data-nav
        onClick={() => a.open(f.path)}
        title={showPath ? prettyGroup(f.path) : f.name}
        className="flex w-full items-center gap-3 rounded-xl p-3 pr-10 text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${drop.over ? 'bg-emerald-500 text-white' : 'bg-amber-400/10 text-amber-500'}`}>
          {drop.over ? (
            <Icon name="folderOpen" className="size-5 animate-wiggle" />
          ) : (
            <>
              <Icon name="folder" className="size-5 group-hover:hidden" fill="currentColor" fillOpacity={0.2} />
              <Icon name="folderOpen" className="hidden size-5 group-hover:block" />
            </>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{f.name}</span>
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{drop.over ? 'Suelta para mover aquí' : summary}</span>
          {showPath && <span className="block truncate text-[11px] text-zinc-400">{prettyGroup(f.path)}</span>}
        </span>
      </button>
      <button
        onClick={(ev) => a.folderMenu(f, menuAt(ev))}
        className="btn-icon absolute top-1/2 right-1.5 size-8 -translate-y-1/2 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        aria-label={`Opciones de ${f.name}`}
        title="Opciones"
      >
        <Icon name="more" />
      </button>
    </div>
  );
}

// --- "Mover a…": selector de carpeta con buscador ----------------------------------
function FolderPicker({
  entry,
  groups,
  rootName,
  onPick,
  onClose,
}: {
  entry: VaultEntry;
  groups: string[];
  rootName: string;
  onPick: (group: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const list = groups.filter((g) => !q || norm(g.split('/').slice(1).join(' ') || rootName).includes(norm(q)));
  const label = (g: string) => (g.includes('/') ? g.split('/').pop()! : rootName);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mover a otra carpeta"
        className="relative flex max-h-[80dvh] w-full max-w-md animate-pop flex-col overflow-hidden rounded-3xl border border-zinc-200/70 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900"
      >
        <div className="border-b border-zinc-200/70 p-5 pb-4 dark:border-white/10">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Icon name="move" className="size-5 text-emerald-500" /> Mover «{entry.title}»
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">Elige la carpeta de destino.</p>
          <input
            autoFocus
            className="field mt-3"
            placeholder="Buscar carpeta…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              const first = list.find((g) => g !== entry.group);
              if (e.key === 'Enter' && first) onPick(first);
            }}
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {list.map((g) => {
            const here = g === entry.group;
            return (
              <li key={g}>
                <button
                  disabled={here}
                  onClick={() => onPick(g)}
                  style={{ paddingLeft: q ? undefined : `${0.75 + (g.split('/').length - 1) * 1}rem` }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-emerald-500/10 hover:text-emerald-700 disabled:opacity-50 disabled:hover:bg-transparent dark:hover:text-emerald-400"
                >
                  <Icon name={g.includes('/') ? 'folder' : 'home'} className="size-4 shrink-0 text-amber-500" />
                  <span className="min-w-0 flex-1 truncate">{q ? prettyGroup(g) || rootName : label(g)}</span>
                  {here && <span className="text-xs text-zinc-400">actual</span>}
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="p-4 text-center text-sm text-zinc-400">Ninguna carpeta coincide.</li>}
        </ul>
      </div>
    </div>
  );
}

// --- Árbol lateral plegable, con guías de jerarquía (acepta entradas soltadas) ----------
function FolderTree({ node, active, depth }: { node: GroupNode; active: string; depth: number }) {
  const a = useContext(ActionsCtx)!;
  const signal = useContext(TreeSignalCtx);
  const drop = useDropTarget(node.path);
  const onPath = active === node.path || node.path === '' || active.startsWith(node.path + '/');
  const [open, setOpen] = useState(onPath);
  // Abre automáticamente las carpetas de la ruta actual
  useEffect(() => {
    if (onPath) setOpen(true);
  }, [onPath]);
  // Desplegar/plegar todo (la ruta actual sigue abierta para no perder de vista dónde estás)
  useEffect(() => {
    if (signal.n) setOpen(signal.open || onPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal.n]);

  // Al mantener una entrada encima de una carpeta cerrada, se despliega sola
  useEffect(() => {
    if (!drop.over || open || !node.children.length) return;
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(t);
  }, [drop.over, open, node.children.length]);

  const selected = active === node.path;
  const hasChildren = node.children.length > 0;
  const root = depth === 0;

  return (
    <div>
      <div
        {...drop.props}
        onContextMenu={(ev) => {
          ev.preventDefault();
          a.folderMenu(node, menuAt(ev));
        }}
        className={`group relative flex h-8 items-center rounded-md text-[13px] transition-colors ${
          drop.over
            ? 'bg-emerald-500 text-white'
            : drop.active
              ? 'bg-emerald-500/5 ring-1 ring-emerald-400/40 ring-inset'
              : selected
                ? 'bg-emerald-500/10 font-medium text-emerald-800 dark:text-emerald-300'
                : 'text-zinc-600 hover:bg-zinc-900/[0.04] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100'
        }`}
      >
        <button
          onClick={() => setOpen(!open)}
          disabled={!hasChildren}
          tabIndex={-1}
          aria-label={open ? `Plegar ${node.name}` : `Desplegar ${node.name}`}
          aria-expanded={hasChildren ? open : undefined}
          className="grid h-full w-5 shrink-0 place-items-center rounded opacity-50 hover:opacity-100 disabled:opacity-0"
        >
          <Icon name="chevronRight" className={`size-3 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        </button>
        <button
          onClick={() => {
            a.open(node.path);
            setOpen(true);
          }}
          title={node.name}
          className="flex h-full min-w-0 flex-1 items-center gap-2 pr-2"
        >
          <Icon
            name={root ? 'home' : selected || drop.over || (open && hasChildren) ? 'folderOpen' : 'folder'}
            className={`size-4 shrink-0 ${root || drop.over ? '' : selected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'} ${
              drop.over ? 'animate-wiggle' : ''
            }`}
          />
          <span className="min-w-0 flex-1 truncate text-left">{root ? 'Inicio' : node.name}</span>
          {node.count > 0 && <span className="text-[11px] tabular-nums opacity-50">{node.count}</span>}
        </button>
      </div>
      {hasChildren && open && (
        // Guía vertical que une a los hijos con su carpeta
        <div className="ml-[0.6rem] border-l border-zinc-200 pl-1.5 dark:border-white/[0.07]">
          {node.children.map((c) => (
            <FolderTree key={c.path} node={c} active={active} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
