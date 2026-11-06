export interface Status {
  connected: boolean;
  unlocked?: boolean;
  associated?: boolean;
  associationId?: string;
  version?: string;
  socketPath?: string;
  error?: string;
}

export interface Entry {
  uuid: string;
  name: string;
  login: string;
  group?: string;
  hasTotp: boolean;
  expired: boolean;
}

export interface Group {
  name: string;
  uuid: string;
  children?: Group[];
}

export interface Secret {
  password: string;
  totp: string | null;
  notes?: string;
  fields?: Record<string, string>;
}

export interface Totp {
  code: string;
  period: number;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      'X-Requested-With': 'kpx-dashboard',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export function flattenGroups(groups: Group[], depth = 0): { group: Group; depth: number }[] {
  return groups.flatMap((g) => [{ group: g, depth }, ...flattenGroups(g.children ?? [], depth + 1)]);
}

// --- Bóveda completa -------------------------------------------------------------
export interface VaultStatus {
  open: boolean;
  dbPath?: string;
  name?: string;
  count?: number;
  openedAt?: number;
  revision?: number;
  expiresAt?: number;
  idleMs: number;
}

export interface VaultEntry {
  uuid: string;
  title: string;
  username: string;
  url: string;
  group: string;
  tags: string[];
  modified?: string;
  expires?: string;
  expired: boolean;
  hasTotp: boolean;
  hasNotes: boolean;
  fieldNames: string[];
  attachments: { name: string; size: number | null }[];
}

export interface VaultSecret {
  password: string;
  notes: string;
  fields: Record<string, string>;
  totp: { code: string; period: number; remaining: number } | null;
}

/** Descarga binaria (adjuntos). */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(path, { headers: { 'X-Requested-With': 'kpx-dashboard' } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.blob();
}

export const attachmentUrl = (uuid: string, name: string) =>
  `/api/vault/entries/${encodeURIComponent(uuid)}/attachments/${encodeURIComponent(name)}`;
