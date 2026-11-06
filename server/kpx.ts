/**
 * Lógica compartida de la API de KeePassXC-Browser (antes en server/index.ts con Fastify).
 * El cliente del socket es un singleton en globalThis: así sobrevive al HMR de `next dev`
 * y todas las rutas comparten la misma conexión y la misma cola de peticiones.
 */
import 'server-only';
import { ErrorCode, KeePassXCClient, KpxError } from './keepassxc';
import { loadAssociations } from './store';
import { lockVault } from './vault';
import { HttpError } from './http';

const g = globalThis as unknown as { __kpxClient?: KeePassXCClient };

function createClient() {
  const client = new KeePassXCClient();
  client.on('event', (action: string) => {
    console.info(`[kpx] evento de KeePassXC: ${action}`);
    // Si bloqueas en KeePassXC, también se cierra la bóveda en memoria
    if (action === 'database-locked') lockVault();
  });
  return client;
}

export const kpx: KeePassXCClient = (g.__kpxClient ??= createClient());

export async function currentDbHash(): Promise<string | null> {
  try {
    const r = await kpx.call('get-databasehash');
    return r.hash ?? null;
  } catch (e) {
    if (e instanceof KpxError && e.code === ErrorCode.DATABASE_NOT_OPENED) return null;
    throw e;
  }
}

export async function allKeys() {
  const all = await loadAssociations();
  return Object.values(all).map(({ id, key }) => ({ id, key }));
}

export async function requireAssociation() {
  const hash = await currentDbHash();
  if (!hash) throw new KpxError('La base de datos está bloqueada', ErrorCode.DATABASE_NOT_OPENED);
  const assoc = (await loadAssociations())[hash];
  if (!assoc) throw new HttpError('Este tablero no está asociado a la base abierta', 401);
  return { hash, assoc };
}

export function normalizeUrl(input: string): string {
  const s = input.trim();
  if (!s) throw new HttpError('URL vacía', 400);
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
}

export interface KpxEntry {
  uuid: string;
  name: string;
  login: string;
  password: string;
  group?: string;
  totp?: string;
  expired?: string;
  stringFields?: Record<string, string>[];
}

export async function getLogins(url: string): Promise<KpxEntry[]> {
  await requireAssociation();
  try {
    // timeout largo: KeePassXC puede pedir confirmación de acceso al usuario
    const r = await kpx.call('get-logins', { url, keys: await allKeys() }, { timeoutMs: 120_000 });
    return r.entries ?? [];
  } catch (e) {
    if (e instanceof KpxError && e.code === ErrorCode.NO_LOGINS_FOUND) return [];
    throw e;
  }
}
