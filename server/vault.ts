/**
 * Bóveda completa: abre el .kdbx con keepassxc-cli (export XML) y mantiene el contenido
 * descifrado SOLO en memoria del proceso, con cierre automático por inactividad.
 * También edita la base (add/edit/mv/rm/mkdir/rmdir/attachment-*) con keepassxc-cli.
 *
 * - La contraseña maestra se pasa por stdin a keepassxc-cli. Se conserva en memoria mientras la
 *   bóveda está abierta (para poder guardar cambios) y se descarta al cerrarla.
 * - El contenido descifrado nunca se escribe a disco. Excepción: los adjuntos, porque keepassxc-cli
 *   solo los importa/exporta vía archivo: pasan un instante por un directorio temporal privado
 *   (0700, archivo 0600) que se borra enseguida.
 * - El TOTP se calcula aquí (RFC 6238) a partir del atributo "otp" de la entrada.
 */
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const CLI = process.env.KEEPASSXC_CLI ?? 'keepassxc-cli';
export const IDLE_MS = Number(process.env.VAULT_IDLE_MS ?? 5 * 60_000);
const STANDARD = new Set(['Title', 'UserName', 'Password', 'URL', 'Notes', 'otp', 'TOTP Seed', 'TOTP Settings']);

export interface VaultEntry {
  uuid: string;
  title: string;
  username: string;
  url: string;
  group: string; // ruta "Raíz/Trabajo/AWS"
  tags: string[];
  modified?: string;
  expires?: string;
  expired: boolean;
  hasTotp: boolean;
  hasNotes: boolean;
  fieldNames: string[];
  attachments: { name: string; size: number | null }[];
}

interface EntrySecret {
  password: string;
  notes: string;
  otp: string | null;
  fields: Record<string, string>;
}

export class VaultError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

// --- Estado en memoria ---------------------------------------------------------
interface State {
  dbPath: string;
  name: string;
  password: string;
  keyFile?: string;
  entries: VaultEntry[];
  groups: string[]; // todas las carpetas (rutas "Raíz/Trabajo"), también las vacías
  secrets: Map<string, EntrySecret>;
  attachments: Map<string, Map<string, Buffer | null>>; // null = no vino en el XML, se pide al CLI
  stamp: string; // mtime+tamaño del .kdbx en la última lectura
  revision: number;
  openedAt: number;
  lastUse: number;
  timer: NodeJS.Timeout;
}
const mem = ((globalThis as any).__kpxVault ??= { state: null, queue: Promise.resolve() }) as { state: State | null; queue: Promise<unknown> };

function touch() {
  if (!mem.state) return;
  mem.state.lastUse = Date.now();
  clearTimeout(mem.state.timer);
  mem.state.timer = setTimeout(lockVault, IDLE_MS);
  mem.state.timer.unref();
}

export function lockVault() {
  if (!mem.state) return;
  clearTimeout(mem.state.timer);
  mem.state.secrets.clear();
  mem.state.attachments.clear();
  mem.state.password = '';
  mem.state = null;
}

export function vaultStatus() {
  if (!mem.state) return { open: false as const, idleMs: IDLE_MS };
  return {
    open: true as const,
    dbPath: mem.state.dbPath,
    name: mem.state.name,
    count: mem.state.entries.length,
    openedAt: mem.state.openedAt,
    revision: mem.state.revision,
    expiresAt: mem.state.lastUse + IDLE_MS,
    idleMs: IDLE_MS,
  };
}

function requireOpen() {
  if (!mem.state) throw new VaultError('La bóveda está cerrada', 423);
  touch();
  return mem.state;
}

export function listEntries() {
  const s = requireOpen();
  return { ...vaultStatus(), entries: s.entries, groups: s.groups };
}

export function revealEntry(uuid: string) {
  const s = requireOpen();
  const sec = s.secrets.get(uuid);
  if (!sec) throw new VaultError('Entrada no encontrada', 404);
  return {
    password: sec.password,
    notes: sec.notes,
    fields: sec.fields,
    totp: sec.otp ? totpFromOtp(sec.otp) : null,
  };
}

/**
 * Solo el código TOTP, para mostrarlo en vivo. No renueva el temporizador de inactividad:
 * dejar un código a la vista no debe impedir que la bóveda se cierre sola.
 */
export function entryTotp(uuid: string) {
  if (!mem.state) throw new VaultError('La bóveda está cerrada', 423);
  const sec = mem.state.secrets.get(uuid);
  if (!sec) throw new VaultError('Entrada no encontrada', 404);
  const t = sec.otp ? totpFromOtp(sec.otp) : null;
  return { totp: t && { code: t.code, period: t.period } };
}

// --- Abrir ---------------------------------------------------------------------

function validPath(p: string | undefined, ext?: string) {
  if (!p) return undefined;
  const abs = p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
  if (!path.isAbsolute(abs)) throw new VaultError('La ruta debe ser absoluta');
  if (ext && !abs.toLowerCase().endsWith(ext)) throw new VaultError(`El archivo debe terminar en ${ext}`);
  if (!existsSync(abs)) throw new VaultError(`No existe: ${abs}`, 404);
  return abs;
}

/**
 * Ejecuta keepassxc-cli: `cmd [opciones] base [posicionales]`. Por stdin va primero la contraseña
 * maestra (si la hay) y luego `extraStdin` (p. ej. la contraseña de la entrada con -p).
 */
function runCli(
  cmd: string,
  opts: { dbPath: string; password: string; keyFile?: string },
  options: string[] = [],
  positional: string[] = [],
  extraStdin: string[] = [],
): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const auth = [...(opts.keyFile ? ['-k', opts.keyFile] : []), ...(opts.password ? [] : ['--no-password'])];
    const child = spawn(/*turbopackIgnore: true*/ CLI, [cmd, ...auth, ...options, opts.dbPath, ...positional], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(new VaultError(`No se pudo ejecutar keepassxc-cli: ${e.message}`, 500)));
    child.on('close', (code) => {
      const stdout = Buffer.concat(out);
      if (code === 0) return resolve({ stdout, stderr: err });
      const lines = (err + '\n' + stdout.toString('utf8'))
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !/^Enter (new )?password/i.test(l));
      const msg = /invalid credentials|wrong key|HMAC mismatch/i.test(err)
        ? 'Contraseña o archivo de clave incorrectos'
        : lines.pop() || `keepassxc-cli terminó con código ${code}`;
      reject(new VaultError(msg, cmd === 'export' ? 401 : 400));
    });
    for (const line of [...(opts.password ? [opts.password] : []), ...extraStdin]) child.stdin.write(line + '\n');
    child.stdin.end();
  });
}

const fileStamp = async (p: string) => {
  const st = await stat(p);
  return `${st.mtimeMs}:${st.size}`;
};

async function readDatabase(opts: { dbPath: string; password: string; keyFile?: string }) {
  const stamp = await fileStamp(opts.dbPath);
  const { stdout } = await runCli('export', opts, ['-f', 'xml']);
  return { ...parseKeePassXml(stdout.toString('utf8')), stamp };
}

export async function openVault(opts: { dbPath?: string; password?: string; keyFile?: string }) {
  const dbPath = validPath(opts.dbPath, '.kdbx');
  if (!dbPath) throw new VaultError('Falta la ruta del archivo .kdbx');
  const keyFile = validPath(opts.keyFile);
  if (!opts.password && !keyFile) throw new VaultError('Falta la contraseña maestra');
  const password = opts.password ?? '';

  const data = await readDatabase({ dbPath, password, keyFile });

  lockVault();
  mem.state = {
    dbPath,
    name: path.basename(dbPath, '.kdbx'),
    password,
    keyFile,
    ...data,
    revision: 1,
    openedAt: Date.now(),
    lastUse: Date.now(),
    timer: setTimeout(() => {}, 0),
  };
  touch();
  return vaultStatus();
}

// --- Edición ---------------------------------------------------------------------

/** Las escrituras van de una en una (cada una abre, guarda y relee el .kdbx). */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = mem.queue.then(fn, fn);
  mem.queue = run.catch(() => {});
  return run;
}

async function reload(s: State) {
  const data = await readDatabase(s);
  if (mem.state !== s) return; // se cerró mientras tanto
  Object.assign(s, data);
  s.revision++;
}

/**
 * Si el .kdbx cambió fuera del tablero (p. ej. desde KeePassXC), relee y aborta: la operación
 * se pensó sobre datos viejos y las entradas se identifican por ruta.
 */
async function ensureFresh(s: State) {
  if ((await fileStamp(s.dbPath)) === s.stamp) return;
  await reload(s);
  throw new VaultError('La base cambió fuera del tablero. La recargué: revisa y vuelve a intentarlo.', 409);
}

/** "Raíz/Trabajo/AWS" → "/Trabajo/AWS" (rutas de keepassxc-cli, relativas a la raíz). */
const cliGroup = (group: string) => '/' + group.split('/').slice(1).join('/');

function checkName(name: string, what: string) {
  const n = name.trim();
  if (!n) throw new VaultError(`Falta el nombre de la ${what}`);
  if (n.includes('/')) throw new VaultError(`El nombre de la ${what} no puede llevar "/"`);
  return n;
}

function requireGroup(s: State, group: string) {
  if (!s.groups.includes(group)) throw new VaultError('La carpeta no existe', 404);
  return group;
}

/** Ruta de la entrada para keepassxc-cli. Falla si es ambigua (dos entradas iguales en la carpeta). */
function entryPath(s: State, uuid: string) {
  const e = s.entries.find((x) => x.uuid === uuid);
  if (!e) throw new VaultError('Entrada no encontrada', 404);
  if (e.title.includes('/') || !e.title)
    throw new VaultError('Esta entrada no se puede editar desde aquí porque su título está vacío o contiene "/". Cámbialo en KeePassXC.', 422);
  if (s.entries.some((x) => x !== e && x.group === e.group && x.title === e.title))
    throw new VaultError(`Hay más de una entrada llamada "${e.title}" en esta carpeta. Renómbralas en KeePassXC para poder editarlas aquí.`, 422);
  const g = cliGroup(e.group);
  return { entry: e, path: (g === '/' ? '' : g) + '/' + e.title };
}

function write<T>(fn: (s: State) => Promise<T>) {
  return serial(async () => {
    const s = requireOpen();
    await ensureFresh(s);
    try {
      return await fn(s);
    } finally {
      // Releer siempre: aunque falle a mitad (p. ej. edit OK y mv KO) la vista queda fiel al archivo
      await reload(s).catch(() => {});
      touch();
    }
  });
}

export interface EntryInput {
  title?: string;
  username?: string;
  url?: string;
  notes?: string;
  password?: string;
  group?: string;
}

export function createEntry(input: EntryInput) {
  return write(async (s) => {
    const title = checkName(input.title ?? '', 'entrada');
    const group = requireGroup(s, input.group || s.groups[0]);
    if (s.entries.some((e) => e.group === group && e.title === title))
      throw new VaultError(`Ya hay una entrada llamada "${title}" en esta carpeta`, 409);
    const g = cliGroup(group);
    const opts = [
      ...(input.username ? [`--username=${input.username}`] : []),
      ...(input.url ? [`--url=${input.url}`] : []),
      ...(input.notes ? [`--notes=${input.notes}`] : []),
      '-p',
    ];
    await runCli('add', s, opts, [(g === '/' ? '' : g) + '/' + title], [input.password ?? '']);
    return { ok: true };
  });
}

export function updateEntry(uuid: string, input: EntryInput) {
  return write(async (s) => {
    const { entry, path: p } = entryPath(s, uuid);
    const opts: string[] = [];
    const extra: string[] = [];
    let title = entry.title;

    const field = (key: 'title' | 'username' | 'url' | 'notes', current: string, flag: string, label: string) => {
      const v = input[key];
      if (v === undefined || v === current) return;
      // keepassxc-cli trata un valor vacío como "sin cambios": no puede vaciar campos
      if (!v.trim()) throw new VaultError(`No se puede dejar vacío "${label}" desde aquí (limitación de keepassxc-cli). Hazlo en KeePassXC.`, 422);
      opts.push(`${flag}=${v}`);
    };
    if (input.title !== undefined && input.title !== entry.title) {
      title = checkName(input.title, 'entrada');
      if (s.entries.some((e) => e !== entry && e.group === entry.group && e.title === title))
        throw new VaultError(`Ya hay una entrada llamada "${title}" en esta carpeta`, 409);
    }
    field('title', entry.title, '--title', 'Título');
    field('username', entry.username, '--username', 'Usuario');
    field('url', entry.url, '--url', 'Sitio');
    field('notes', s.secrets.get(uuid)?.notes ?? '', '--notes', 'Notas');
    if (input.password) {
      opts.push('-p');
      extra.push(input.password);
    }

    const target = input.group && input.group !== entry.group ? requireGroup(s, input.group) : null;
    if (target && s.entries.some((e) => e.group === target && e.title === title))
      throw new VaultError(`En la carpeta de destino ya hay una entrada llamada "${title}"`, 409);

    if (opts.length) await runCli('edit', s, opts, [p], extra);
    if (target) {
      const g = cliGroup(entry.group);
      await runCli('mv', s, [], [(g === '/' ? '' : g) + '/' + title, cliGroup(target)]);
    }
    return { ok: true, changed: opts.length > 0 || Boolean(target) };
  });
}

export function deleteEntry(uuid: string) {
  return write(async (s) => {
    const { path: p } = entryPath(s, uuid);
    const { stdout } = await runCli('rm', s, [], [p]);
    return { ok: true, recycled: /recycled/i.test(stdout.toString()) };
  });
}

export function createGroup(parent: string, name: string) {
  return write(async (s) => {
    const n = checkName(name, 'carpeta');
    const par = requireGroup(s, parent || s.groups[0]);
    if (s.groups.includes(`${par}/${n}`)) throw new VaultError(`Ya existe la carpeta "${n}"`, 409);
    const g = cliGroup(par);
    await runCli('mkdir', s, [], [(g === '/' ? '' : g) + '/' + n]);
    return { ok: true, group: `${par}/${n}` };
  });
}

export function deleteGroup(group: string) {
  return write(async (s) => {
    requireGroup(s, group);
    if (!group.includes('/')) throw new VaultError('No se puede borrar la carpeta raíz');
    const { stdout } = await runCli('rmdir', s, [], [cliGroup(group)]);
    return { ok: true, recycled: /recycled/i.test(stdout.toString()) };
  });
}

// --- Adjuntos --------------------------------------------------------------------

/** Directorio temporal privado para keepassxc-cli, borrado siempre al terminar. */
async function withTempDir<T>(fn: (dir: string) => Promise<T>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kpxd-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function getAttachment(uuid: string, name: string) {
  const s = requireOpen();
  const files = s.attachments.get(uuid);
  if (!files?.has(name)) throw new VaultError('Adjunto no encontrado', 404);
  const cached = files.get(name);
  if (cached) return cached;
  // El export XML de keepassxc-cli a veces omite el contenido; se pide aparte.
  // (--stdout no sirve: corrompe los binarios al pasarlos por texto.)
  return serial(async () => {
    await ensureFresh(s);
    const { path: p } = entryPath(s, uuid);
    const data = await withTempDir(async (dir) => {
      const file = path.join(dir, 'adjunto');
      await runCli('attachment-export', s, [], [p, name, file]);
      return readFile(file);
    });
    if (mem.state === s) files.set(name, data);
    return data;
  });
}

export const MAX_ATTACHMENT = 16 * 1024 * 1024;

export function addAttachment(uuid: string, name: string, data: Buffer, overwrite = false) {
  return write(async (s) => {
    const { path: p } = entryPath(s, uuid);
    const n = name.trim();
    if (!n) throw new VaultError('Falta el nombre del adjunto');
    if (data.length > MAX_ATTACHMENT) throw new VaultError('El archivo supera 16 MB', 413);
    if (!overwrite && s.attachments.get(uuid)?.has(n)) throw new VaultError(`Ya hay un adjunto llamado "${n}"`, 409);
    // keepassxc-cli solo importa desde un archivo
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'adjunto');
      await writeFile(file, data, { mode: 0o600 });
      await runCli('attachment-import', s, overwrite ? ['-f'] : [], [p, n, file]);
    });
    return { ok: true };
  });
}

export function removeAttachment(uuid: string, name: string) {
  return write(async (s) => {
    const { path: p } = entryPath(s, uuid);
    if (!s.attachments.get(uuid)?.has(name)) throw new VaultError('Adjunto no encontrado', 404);
    await runCli('attachment-rm', s, [], [p, name]);
    return { ok: true };
  });
}

/** Bases .kdbx en las carpetas habituales (para sugerirlas en la UI). */
export async function findCandidates(): Promise<string[]> {
  const home = os.homedir();
  const dirs = [home, ...['Documents', 'Desktop', 'Downloads', 'Dropbox', 'Google Drive'].map((d) => path.join(/*turbopackIgnore: true*/ home, d))];
  const found: string[] = [];
  for (const d of dirs) {
    try {
      for (const f of await readdir(d)) if (f.toLowerCase().endsWith('.kdbx')) found.push(path.join(d, f));
    } catch {
      /* carpeta inexistente o sin permiso */
    }
  }
  return found;
}

// --- Parseo del XML de KeePass ---------------------------------------------------

const asArray = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v: any): string => (v == null ? '' : typeof v === 'object' ? String(v['#text'] ?? '') : String(v));
const b64ToHex = (b: string) => Buffer.from(b, 'base64').toString('hex');

export function parseKeePassXml(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    parseTagValue: false,
    trimValues: false,
    isArray: (name) => ['Group', 'Entry', 'String', 'Binary'].includes(name),
  });
  const doc = parser.parse(xml);
  const root = doc?.KeePassFile?.Root;
  if (!root) throw new VaultError('Formato de exportación inesperado', 500);

  const recycleBin = text(doc.KeePassFile.Meta?.RecycleBinUUID);
  const entries: VaultEntry[] = [];
  const groups: string[] = [];
  const secrets = new Map<string, EntrySecret>();
  const attachments = new Map<string, Map<string, Buffer | null>>();
  const now = Date.now();

  // Binarios compartidos (Meta/Binaries), referenciados por ID desde las entradas
  const pool = new Map<string, Buffer>();
  for (const b of asArray<any>(doc.KeePassFile.Meta?.Binaries?.Binary)) {
    const raw = Buffer.from(text(b), 'base64');
    pool.set(String(b['@ID']), b['@Compressed'] === 'True' ? gunzipSync(raw) : raw);
  }

  const walk = (group: any, trail: string[]) => {
    const uuid = text(group.UUID);
    if (recycleBin && uuid === recycleBin) return; // ignorar la papelera
    const here = [...trail, text(group.Name)];
    groups.push(here.join('/'));
    for (const e of asArray<any>(group.Entry)) {
      const str: Record<string, string> = {};
      for (const s of asArray<any>(e.String)) str[text(s.Key)] = text(s.Value);
      const times = e.Times ?? {};
      const expires = text(times.Expires) === 'True' ? text(times.ExpiryTime) : undefined;
      const id = b64ToHex(text(e.UUID));
      const otp = str.otp || (str['TOTP Seed'] ? legacyOtp(str['TOTP Seed'], str['TOTP Settings']) : '') || null;
      const fields = Object.fromEntries(Object.entries(str).filter(([k]) => !STANDARD.has(k)));
      const files = new Map<string, Buffer | null>();
      for (const b of asArray<any>(e.Binary)) {
        const v = b.Value;
        const data = v?.['@Ref'] != null ? pool.get(String(v['@Ref'])) : Buffer.from(text(v), 'base64');
        files.set(text(b.Key), data ?? null);
      }

      entries.push({
        uuid: id,
        title: str.Title ?? '',
        username: str.UserName ?? '',
        url: str.URL ?? '',
        group: here.join('/'),
        tags: text(e.Tags).split(/[;,]/).map((t) => t.trim()).filter(Boolean),
        modified: text(times.LastModificationTime) || undefined,
        expires,
        expired: Boolean(expires && Date.parse(expires) < now),
        hasTotp: Boolean(otp),
        hasNotes: Boolean(str.Notes?.trim()),
        fieldNames: Object.keys(fields),
        attachments: [...files].map(([name, d]) => ({ name, size: d ? d.length : null })),
      });
      secrets.set(id, { password: str.Password ?? '', notes: str.Notes ?? '', otp, fields });
      if (files.size) attachments.set(id, files);
    }
    for (const g of asArray<any>(group.Group)) walk(g, here);
  };
  for (const g of asArray<any>(root.Group)) walk(g, []);

  entries.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
  return { entries, groups, secrets, attachments };
}

// --- TOTP (RFC 6238) -------------------------------------------------------------

function legacyOtp(seed: string, settings = '30;6') {
  const [period, digits] = settings.split(';');
  if (digits === 'S') return ''; // formato Steam: no soportado
  return `otpauth://totp/x?secret=${encodeURIComponent(seed)}&period=${period || 30}&digits=${digits || 6}`;
}

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = alphabet.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpFromOtp(otp: string, now = Date.now()) {
  let secret = otp;
  let period = 30;
  let digits = 6;
  let algorithm = 'sha1';
  if (otp.startsWith('otpauth://')) {
    const u = new URL(otp);
    secret = u.searchParams.get('secret') ?? '';
    period = Number(u.searchParams.get('period') ?? 30) || 30;
    digits = Number(u.searchParams.get('digits') ?? 6) || 6;
    algorithm = (u.searchParams.get('algorithm') ?? 'SHA1').toLowerCase();
    if (u.searchParams.get('encoder') === 'steam') return null;
  }
  const key = base32Decode(secret);
  if (!key.length) return null;
  const counter = Math.floor(now / 1000 / period);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac(algorithm, key).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return {
    code: String(bin % 10 ** digits).padStart(digits, '0'),
    period,
    remaining: period - (Math.floor(now / 1000) % period),
  };
}
