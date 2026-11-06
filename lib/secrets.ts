export const CLIPBOARD_CLEAR_MS = 30_000;
export const REVEAL_MS = 15_000;
export const TOTP_PERIOD = 30;

let clipboardTimer: number | undefined;

/** Copia al portapapeles; si es sensible, lo vacía pasado CLIPBOARD_CLEAR_MS. */
export async function copyText(text: string, sensitive = true) {
  await navigator.clipboard.writeText(text);
  if (!sensitive) return;
  window.clearTimeout(clipboardTimer);
  clipboardTimer = window.setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), CLIPBOARD_CLEAR_MS);
}

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+?';

function randomIndex(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max; // muestreo sin sesgo
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

export function generatePassword({ length = 24, symbols = true } = {}): string {
  const sets = [LOWER, UPPER, DIGITS, ...(symbols ? [SYMBOLS] : [])];
  const all = sets.join('');
  // garantiza al menos un carácter de cada grupo
  const chars = sets.map((s) => s[randomIndex(s.length)]);
  while (chars.length < length) chars.push(all[randomIndex(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  bits: number;
}

export function strength(pw: string): Strength | null {
  if (!pw) return null;
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
  const unique = new Set(pw).size;
  const bits = Math.round(Math.min(pw.length, unique * 1.5) * Math.log2(Math.max(pool, 2)));
  const [score, label] =
    bits < 28 ? [0, 'Muy débil'] : bits < 40 ? [1, 'Débil'] : bits < 64 ? [2, 'Aceptable'] : bits < 100 ? [3, 'Fuerte'] : [4, 'Excelente'];
  return { score: score as Strength['score'], label, bits };
}
