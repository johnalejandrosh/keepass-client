/**
 * Cliente del protocolo de KeePassXC-Browser.
 *
 * KeePassXC expone un socket local (el mismo que usa keepassxc-proxy / la extensión
 * del navegador). Los mensajes son JSON; tras un intercambio de claves públicas
 * (change-public-keys) el contenido va cifrado con NaCl crypto_box.
 *
 * Referencia: https://github.com/keepassxreboot/keepassxc-browser/blob/develop/keepassxc-protocol.md
 */
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import nacl from 'tweetnacl';

export const ErrorCode = {
  DATABASE_NOT_OPENED: 1,
  ACTION_CANCELLED_OR_DENIED: 6,
  ASSOCIATION_FAILED: 8,
  NO_LOGINS_FOUND: 15,
  NO_GROUPS_FOUND: 16,
} as const;

export class KpxError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
    this.name = 'KpxError';
  }
}

export class KpxConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KpxConnectionError';
  }
}

const SERVER_NAME = 'org.keepassxc.KeePassXC.BrowserServer';

export function defaultSocketPath(): string {
  if (process.env.KEEPASSXC_SOCKET) return process.env.KEEPASSXC_SOCKET;
  switch (process.platform) {
    case 'win32':
      return `\\\\.\\pipe\\${SERVER_NAME}_${os.userInfo().username}`;
    case 'linux': {
      const runtime = process.env.XDG_RUNTIME_DIR ?? os.tmpdir();
      return path.join(runtime, 'app', 'org.keepassxc.KeePassXC', SERVER_NAME);
    }
    default: // macOS: $TMPDIR
      return path.join(os.tmpdir(), SERVER_NAME);
  }
}

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

/** sodium_increment: suma 1 al nonce en little-endian. */
function incrementNonce(n: Uint8Array): Uint8Array {
  const r = new Uint8Array(n);
  let carry = 1;
  for (let i = 0; i < r.length; i++) {
    carry += r[i];
    r[i] = carry & 0xff;
    carry >>= 8;
  }
  return r;
}

type Json = Record<string, any>;

interface Pending {
  action: string;
  resolve: (msg: Json) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class KeePassXCClient extends EventEmitter {
  readonly socketPath: string;
  serverVersion?: string;

  private sock?: net.Socket;
  private decoder = new StringDecoder('utf8');
  private buf = '';
  private keys = nacl.box.keyPair();
  private clientId = b64(nacl.randomBytes(24));
  private serverPublicKey?: Uint8Array;
  private pending?: Pending;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(socketPath = defaultSocketPath()) {
    super();
    this.socketPath = socketPath;
  }

  /** Clave pública de esta sesión (se usa como "key" al asociar). */
  get sessionPublicKey(): string {
    return b64(this.keys.publicKey);
  }

  /** Conecta y negocia claves si hace falta. */
  ensureReady(): Promise<void> {
    return this.enqueue(() => this.connectInner());
  }

  /**
   * Envía una acción cifrada y devuelve el mensaje descifrado.
   * Las peticiones se serializan: KeePassXC responde en orden y sin requestID fiable.
   */
  call(action: string, params: Json = {}, opts: { timeoutMs?: number; triggerUnlock?: boolean } = {}): Promise<Json> {
    return this.enqueue(async () => {
      await this.connectInner();
      return this.encryptedRequest(action, params, opts.timeoutMs ?? 15_000, opts.triggerUnlock);
    });
  }

  close() {
    this.sock?.destroy();
  }

  // ---------------------------------------------------------------------------

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async connectInner(): Promise<void> {
    if (this.sock && this.serverPublicKey) return;

    if (!this.sock) {
      await new Promise<void>((resolve, reject) => {
        const s = net.createConnection(this.socketPath);
        const onError = (err: NodeJS.ErrnoException) => {
          const hint =
            err.code === 'ENOENT' || err.code === 'ECONNREFUSED'
              ? 'KeePassXC no está abierto o la integración con navegador está desactivada'
              : err.message;
          reject(new KpxConnectionError(hint));
        };
        s.once('error', onError);
        s.once('connect', () => {
          s.off('error', onError);
          s.on('error', () => s.destroy());
          s.on('data', (chunk) => this.onData(chunk));
          s.on('close', () => this.onClose());
          this.sock = s;
          resolve();
        });
      });
    }

    const nonce = nacl.randomBytes(24);
    const res = await this.rawRequest(
      {
        action: 'change-public-keys',
        publicKey: b64(this.keys.publicKey),
        nonce: b64(nonce),
        clientID: this.clientId,
      },
      'change-public-keys',
      5_000,
    );
    if (res.success !== 'true' || !res.publicKey) {
      throw new KpxError(res.error ?? 'Falló el intercambio de claves', Number(res.errorCode));
    }
    this.serverPublicKey = unb64(res.publicKey);
    this.serverVersion = res.version;
  }

  private async encryptedRequest(action: string, params: Json, timeoutMs: number, triggerUnlock?: boolean) {
    const serverKey = this.serverPublicKey!;
    const nonce = nacl.randomBytes(24);
    const inner = JSON.stringify({ action, ...params });
    const message = nacl.box(new TextEncoder().encode(inner), nonce, serverKey, this.keys.secretKey);

    const res = await this.rawRequest(
      {
        action,
        message: b64(message),
        nonce: b64(nonce),
        clientID: this.clientId,
        ...(triggerUnlock ? { triggerUnlock: 'true' } : {}),
      },
      action,
      timeoutMs,
    );

    if (res.error || !res.message) {
      throw new KpxError(res.error ?? 'Respuesta vacía de KeePassXC', res.errorCode != null ? Number(res.errorCode) : undefined);
    }

    const resNonce = unb64(res.nonce);
    if (b64(resNonce) !== b64(incrementNonce(nonce))) {
      throw new KpxError('Nonce de respuesta inválido');
    }
    const plain = nacl.box.open(unb64(res.message), resNonce, serverKey, this.keys.secretKey);
    if (!plain) throw new KpxError('No se pudo descifrar la respuesta');
    return JSON.parse(new TextDecoder().decode(plain)) as Json;
  }

  private rawRequest(msg: Json, action: string, timeoutMs: number): Promise<Json> {
    const sock = this.sock;
    if (!sock) return Promise.reject(new KpxConnectionError('No conectado'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = undefined;
        reject(new KpxError(`Tiempo de espera agotado (${action})`));
      }, timeoutMs);
      this.pending = { action, resolve, reject, timer };
      sock.write(JSON.stringify(msg));
    });
  }

  /** Separa el stream en objetos JSON completos (pueden llegar juntos o partidos). */
  private onData(chunk: Buffer) {
    this.buf += this.decoder.write(chunk);
    let depth = 0;
    let inStr = false;
    let esc = false;
    let start = -1;
    let consumed = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const c = this.buf[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          this.onMessage(this.buf.slice(start, i + 1));
          consumed = i + 1;
          start = -1;
        }
      }
    }
    this.buf = this.buf.slice(consumed);
  }

  private onMessage(raw: string) {
    let msg: Json;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const p = this.pending;
    if (p && msg.action === p.action) {
      clearTimeout(p.timer);
      this.pending = undefined;
      p.resolve(msg);
      return;
    }
    // Eventos espontáneos: database-locked, database-unlocked, etc.
    if (typeof msg.action === 'string') this.emit('event', msg.action, msg);
  }

  private onClose() {
    this.sock = undefined;
    this.serverPublicKey = undefined;
    this.buf = '';
    const p = this.pending;
    if (p) {
      clearTimeout(p.timer);
      this.pending = undefined;
      p.reject(new KpxConnectionError('KeePassXC cerró la conexión'));
    }
  }
}
