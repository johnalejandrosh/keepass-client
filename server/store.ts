/**
 * Guarda las asociaciones con KeePassXC (id + clave de identificación por base de datos).
 * Funcionan como credencial: con ellas se pueden pedir entradas a KeePassXC,
 * por eso el archivo se escribe con permisos 0600 fuera del repositorio.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface Association {
  id: string;
  key: string;
  createdAt: string;
}

const DIR = process.env.KPX_DASHBOARD_HOME ?? path.join(os.homedir(), '.config', 'keepassxc-dashboard');
const FILE = path.join(DIR, 'associations.json');

export async function loadAssociations(): Promise<Record<string, Association>> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
}

async function persist(all: Record<string, Association>) {
  await mkdir(DIR, { recursive: true, mode: 0o700 });
  await writeFile(FILE, JSON.stringify(all, null, 2), { mode: 0o600 });
}

export async function saveAssociation(dbHash: string, a: Association) {
  const all = await loadAssociations();
  all[dbHash] = a;
  await persist(all);
}

export async function removeAssociation(dbHash: string) {
  const all = await loadAssociations();
  delete all[dbHash];
  await persist(all);
}
