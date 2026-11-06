/**
 * Vista previa de adjuntos en el navegador, sin dependencias y sin descargar el archivo:
 * imágenes, PDF, audio, vídeo, texto/JSON/CSV, ZIP (listado) y documentos de oficina
 * (ODF: odt/ods/odp · OOXML: docx/xlsx/pptx) leyendo su XML interno.
 *
 * Los documentos se muestran simplificados (texto, títulos, listas y tablas). Nunca se usa
 * innerHTML: el contenido se convierte en bloques que React pinta como texto.
 */

// --- Tipos de archivo -------------------------------------------------------------
export type Category = 'image' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'audio' | 'video' | 'archive' | 'text' | 'key' | 'other';

const EXT: Record<Category, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'],
  pdf: ['pdf'],
  doc: ['odt', 'docx', 'doc', 'rtf', 'pages', 'ott', 'dotx'],
  sheet: ['ods', 'xlsx', 'xls', 'csv', 'tsv', 'numbers', 'ots', 'xltx'],
  slides: ['odp', 'pptx', 'ppt', 'key', 'otp', 'potx'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'],
  video: ['mp4', 'webm', 'mov', 'm4v', 'ogv'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'jar'],
  text: [
    'txt', 'md', 'markdown', 'json', 'xml', 'yml', 'yaml', 'ini', 'conf', 'cfg', 'env', 'log', 'sh', 'bash', 'zsh', 'ps1',
    'bat', 'cmd', 'sql', 'toml', 'properties', 'html', 'htm', 'css', 'js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'java',
    'kt', 'cs', 'php', 'rs', 'c', 'h', 'cpp', 'swift', 'gradle', 'tf', 'hcl', 'csr',
  ],
  key: ['pem', 'crt', 'cer', 'der', 'p12', 'pfx', 'pub', 'asc', 'gpg', 'ppk', 'keyx', 'kdbx', 'ovpn', 'jks'],
  other: [],
};
const BY_EXT = new Map(Object.entries(EXT).flatMap(([cat, list]) => list.map((e) => [e, cat as Category])));

export const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');
export const categoryOf = (name: string): Category => BY_EXT.get(extOf(name)) ?? 'other';

export const CATEGORY_LABEL: Record<Category, string> = {
  image: 'Imagen',
  pdf: 'PDF',
  doc: 'Documento',
  sheet: 'Hoja de cálculo',
  slides: 'Presentación',
  audio: 'Audio',
  video: 'Vídeo',
  archive: 'Comprimido',
  text: 'Texto',
  key: 'Clave o certificado',
  other: 'Archivo',
};

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon', pdf: 'application/pdf',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac',
  flac: 'audio/flac', opus: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  m4v: 'video/mp4', ogv: 'video/ogg',
};

const OFFICE = new Set(['odt', 'ods', 'odp', 'ott', 'ots', 'otp', 'docx', 'dotx', 'xlsx', 'xltx', 'pptx', 'potx']);

/** ¿Merece la pena pedir el archivo para pintar una miniatura en la lista? */
export const hasThumbnail = (name: string) => categoryOf(name) === 'image' || OFFICE.has(extOf(name));

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

// --- Resultado de la vista previa --------------------------------------------------
export type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'li'; text: string }
  | { t: 'table'; name?: string; rows: string[][]; truncated?: boolean };

export type Rendered =
  | { kind: 'image' | 'pdf' | 'audio' | 'video'; url: string }
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'doc'; blocks: Block[]; thumb?: string; truncated: boolean }
  | { kind: 'zip'; files: { name: string; size: number }[] }
  | { kind: 'none'; reason: string };

/** URLs temporales que hay que liberar al cerrar la vista previa. */
export const urlsOf = (r: Rendered | null) =>
  !r ? [] : 'url' in r ? [r.url] : r.kind === 'doc' && r.thumb ? [r.thumb] : [];

const MAX_TEXT = 512 * 1024;
const MAX_BLOCKS = 3000;
const MAX_ROWS = 500;
const MAX_COLS = 40;
const MAX_UNZIP = 64 * 1024 * 1024;

export async function renderFile(name: string, blob: Blob): Promise<Rendered> {
  const ext = extOf(name);
  const cat = categoryOf(name);
  const typed = (type: string) => URL.createObjectURL(new Blob([blob], { type }));

  if (cat === 'image' || cat === 'pdf' || cat === 'audio' || cat === 'video') {
    return { kind: cat, url: typed(MIME[ext] ?? 'application/octet-stream') };
  }

  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);

  try {
    if (OFFICE.has(ext)) return await renderOffice(ext, bytes);
    if (ext === 'zip' || ext === 'jar') {
      const zip = openZip(bytes);
      return { kind: 'zip', files: [...zip.values()].filter((f) => !f.name.endsWith('/')).map((f) => ({ name: f.name, size: f.size })) };
    }
  } catch (e) {
    return { kind: 'none', reason: `No se pudo leer el archivo: ${(e as Error).message}` };
  }

  if (cat === 'text' || cat === 'key' || cat === 'sheet' || cat === 'other') {
    if (!looksLikeText(bytes)) {
      return { kind: 'none', reason: cat === 'other' ? 'Este tipo de archivo no tiene vista previa.' : 'El archivo es binario y no se puede mostrar.' };
    }
    const truncated = bytes.length > MAX_TEXT;
    let text = new TextDecoder().decode(truncated ? bytes.subarray(0, MAX_TEXT) : bytes);
    if (ext === 'csv' || ext === 'tsv') {
      const rows = parseCsv(text, ext === 'tsv' ? '\t' : guessSeparator(text));
      return { kind: 'doc', blocks: [{ t: 'table', rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS }], truncated };
    }
    if (ext === 'json') {
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* se muestra tal cual */
      }
    }
    return { kind: 'text', text, truncated };
  }

  return { kind: 'none', reason: 'Este tipo de archivo no tiene vista previa.' };
}

/** Miniatura para la lista (o null): la imagen misma, o la que traen dentro odt/docx/… */
export async function thumbnailOf(name: string, blob: Blob): Promise<string | null> {
  if (categoryOf(name) === 'image') return URL.createObjectURL(new Blob([blob], { type: MIME[extOf(name)] ?? 'image/png' }));
  if (!OFFICE.has(extOf(name))) return null;
  try {
    const zip = openZip(new Uint8Array(await blob.arrayBuffer()));
    return await zipThumbnail(zip);
  } catch {
    return null;
  }
}

// --- Texto ---------------------------------------------------------------------------
function looksLikeText(bytes: Uint8Array) {
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: true });
    return true;
  } catch {
    return false;
  }
}

function guessSeparator(text: string) {
  const line = text.slice(0, text.indexOf('\n') >>> 0 || 2000);
  const count = (c: string) => line.split(c).length;
  return count(';') > count(',') ? ';' : count('\t') > count(',') ? '\t' : ',';
}

function parseCsv(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === sep) row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
      if (rows.length > MAX_ROWS) break;
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.map((r) => r.slice(0, MAX_COLS));
}

// --- ZIP mínimo (directorio central + deflate con DecompressionStream) -------------------
interface ZipFile {
  name: string;
  size: number;
  read: () => Promise<Uint8Array<ArrayBuffer>>;
}

function openZip(u8: Uint8Array<ArrayBuffer>): Map<string, ZipFile> {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('no es un ZIP válido');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = new Map<string, ZipFile>();
  for (let i = 0; i < count && p + 46 <= u8.length; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    files.set(name, {
      name,
      size: usize,
      read: async () => {
        if (usize > MAX_UNZIP) throw new Error('contenido interno demasiado grande');
        const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
        const data = u8.slice(start, start + csize);
        if (method === 0) return data;
        if (method !== 8) throw new Error('compresión no soportada');
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      },
    });
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

async function zipThumbnail(zip: Map<string, ZipFile>) {
  for (const [path, type] of [
    ['Thumbnails/thumbnail.png', 'image/png'],
    ['docProps/thumbnail.jpeg', 'image/jpeg'],
    ['docProps/thumbnail.jpg', 'image/jpeg'],
    ['docProps/thumbnail.png', 'image/png'],
  ]) {
    const f = zip.get(path);
    if (f) return URL.createObjectURL(new Blob([await f.read()], { type }));
  }
  return null;
}

const xml = async (zip: Map<string, ZipFile>, path: string) => {
  const f = zip.get(path);
  if (!f) return null;
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(await f.read()), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`XML dañado (${path})`);
  return doc;
};
const all = (el: Document | Element, tag: string, ns = '*') => Array.from(el.getElementsByTagNameNS(ns, tag));
const kids = (el: Element) => Array.from(el.children);

// --- Documentos de oficina -----------------------------------------------------------
async function renderOffice(ext: string, bytes: Uint8Array<ArrayBuffer>): Promise<Rendered> {
  const zip = openZip(bytes);
  const thumb = (await zipThumbnail(zip).catch(() => null)) ?? undefined;
  const blocks: Block[] = [];

  if (ext.startsWith('o')) {
    const doc = await xml(zip, 'content.xml');
    const body = doc && all(doc, 'body')[0];
    if (body) odfBlocks(body, blocks, { slide: 0 });
  } else if (ext === 'docx' || ext === 'dotx') {
    const doc = await xml(zip, 'word/document.xml');
    const body = doc && all(doc, 'body')[0];
    if (body) docxBlocks(body, blocks);
  } else if (ext === 'xlsx' || ext === 'xltx') {
    await xlsxBlocks(zip, blocks);
  } else if (ext === 'pptx' || ext === 'potx') {
    await pptxBlocks(zip, blocks);
  }

  return { kind: 'doc', blocks: blocks.slice(0, MAX_BLOCKS), thumb, truncated: blocks.length > MAX_BLOCKS };
}

// ODF (OpenDocument: LibreOffice, etc.)
function odfText(el: Element): string {
  let out = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += n.nodeValue;
    else if (n.nodeType === Node.ELEMENT_NODE) {
      const e = n as Element;
      if (e.localName === 's') out += ' '.repeat(Number(e.getAttribute('text:c')) || 1);
      else if (e.localName === 'tab') out += '\t';
      else if (e.localName === 'line-break') out += '\n';
      else if (e.localName !== 'note' && e.localName !== 'annotation') out += odfText(e);
    }
  });
  return out;
}

function odfBlocks(el: Element, out: Block[], ctx: { slide: number }) {
  for (const c of kids(el)) {
    if (out.length > MAX_BLOCKS) return;
    switch (c.localName) {
      case 'h':
        out.push({ t: 'h', level: Math.min(Number(c.getAttribute('text:outline-level')) || 1, 4), text: odfText(c) });
        break;
      case 'p': {
        const text = odfText(c);
        if (text.trim()) out.push({ t: 'p', text });
        break;
      }
      case 'list-item': {
        const from = out.length;
        odfBlocks(c, out, ctx);
        for (let i = from; i < out.length; i++) {
          const b = out[i];
          if (b.t === 'p') out[i] = { t: 'li', text: b.text };
        }
        break;
      }
      case 'table': {
        const rows = odfTable(c);
        out.push({ t: 'table', name: c.getAttribute('table:name') ?? undefined, rows, truncated: rows.length >= MAX_ROWS });
        break;
      }
      case 'page': // diapositiva de odp
        out.push({ t: 'h', level: 2, text: `Diapositiva ${++ctx.slide}` });
        odfBlocks(c, out, ctx);
        break;
      case 'tracked-changes':
      case 'sequence-decls':
      case 'forms':
      case 'notes':
        break;
      default:
        odfBlocks(c, out, ctx);
    }
  }
}

function odfTable(table: Element): string[][] {
  const rows: string[][] = [];
  const walk = (el: Element) => {
    for (const c of kids(el)) {
      if (rows.length >= MAX_ROWS) return;
      if (c.localName === 'table-row') {
        const row: string[] = [];
        for (const cell of kids(c)) {
          if (cell.localName !== 'table-cell' && cell.localName !== 'covered-table-cell') continue;
          const text = kids(cell).map(odfText).join('\n');
          const rep = Math.min(Number(cell.getAttribute('table:number-columns-repeated')) || 1, MAX_COLS);
          for (let i = 0; i < rep && row.length < MAX_COLS; i++) row.push(text);
        }
        const rep = Math.min(Number(c.getAttribute('table:number-rows-repeated')) || 1, MAX_ROWS);
        for (let i = 0; i < rep && rows.length < MAX_ROWS; i++) rows.push(row);
      } else if (c.localName !== 'table') walk(c); // grupos de filas; no tablas anidadas
    }
  };
  walk(table);
  return trimTable(rows);
}

/** Quita filas y columnas vacías del final (las hojas de cálculo repiten celdas vacías). */
function trimTable(rows: string[][]) {
  while (rows.length && rows[rows.length - 1].every((c) => !c.trim())) rows.pop();
  const width = Math.max(0, ...rows.map((r) => r.reduce((w, c, i) => (c.trim() ? i + 1 : w), 0)));
  return rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}

// DOCX (Word)
function docxText(el: Element): string {
  let out = '';
  for (const c of kids(el)) {
    if (c.localName === 't') out += c.textContent ?? '';
    else if (c.localName === 'tab') out += '\t';
    else if (c.localName === 'br' || c.localName === 'cr') out += '\n';
    else if (c.localName !== 'delText' && c.localName !== 'instrText' && c.localName !== 'pPr' && c.localName !== 'rPr') out += docxText(c);
  }
  return out;
}

function docxBlocks(el: Element, out: Block[]) {
  for (const c of kids(el)) {
    if (out.length > MAX_BLOCKS) return;
    if (c.localName === 'p') {
      const text = docxText(c);
      if (!text.trim()) continue;
      const style = all(c, 'pStyle')[0]?.getAttribute('w:val') ?? '';
      const heading = /^(heading|t[ií]?tulo|ttulo|title)\s*(\d)?/i.exec(style);
      if (heading) out.push({ t: 'h', level: Math.min(Number(heading[2]) || 1, 4), text });
      else if (all(c, 'numPr').length) out.push({ t: 'li', text });
      else out.push({ t: 'p', text });
    } else if (c.localName === 'tbl') {
      const rows = kids(c)
        .filter((r) => r.localName === 'tr')
        .slice(0, MAX_ROWS)
        .map((r) =>
          kids(r)
            .filter((x) => x.localName === 'tc')
            .slice(0, MAX_COLS)
            .map((tc) => all(tc, 'p').map(docxText).join('\n')),
        );
      out.push({ t: 'table', rows: trimTable(rows) });
    } else if (c.localName === 'sdt' || c.localName === 'sdtContent' || c.localName === 'customXml') {
      docxBlocks(c, out);
    }
  }
}

// XLSX (Excel)
const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

async function xlsxBlocks(zip: Map<string, ZipFile>, out: Block[]) {
  const sst = await xml(zip, 'xl/sharedStrings.xml');
  const shared = sst ? all(sst, 'si').map((si) => all(si, 't').map((t) => t.textContent ?? '').join('')) : [];
  const wb = await xml(zip, 'xl/workbook.xml');
  const rels = await xml(zip, 'xl/_rels/workbook.xml.rels');
  const target = new Map(rels ? all(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']) : []);

  for (const sheet of wb ? all(wb, 'sheet') : []) {
    const rid =
      sheet.getAttribute('r:id') ??
      sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const t = target.get(rid) ?? '';
    const doc = t && (await xml(zip, t.startsWith('/') ? t.slice(1) : `xl/${t}`));
    if (!doc) continue;
    const rows: string[][] = [];
    for (const row of all(doc, 'row')) {
      const r = Number(row.getAttribute('r')) - 1 || rows.length;
      if (r >= MAX_ROWS) break;
      const cells: string[] = [];
      for (const c of kids(row).filter((x) => x.localName === 'c')) {
        const ci = c.getAttribute('r') ? colIndex(c.getAttribute('r')!) : cells.length;
        if (ci >= MAX_COLS) continue;
        const v = kids(c).find((x) => x.localName === 'v')?.textContent ?? '';
        const type = c.getAttribute('t');
        cells[ci] =
          type === 's'
            ? (shared[Number(v)] ?? '')
            : type === 'inlineStr'
              ? all(c, 't').map((x) => x.textContent ?? '').join('')
              : type === 'b'
                ? v === '1'
                  ? 'VERDADERO'
                  : 'FALSO'
                : v;
      }
      rows[r] = Array.from(cells, (x) => x ?? '');
    }
    const table = trimTable(Array.from(rows, (x) => x ?? []));
    out.push({ t: 'table', name: sheet.getAttribute('name') ?? undefined, rows: table, truncated: table.length >= MAX_ROWS });
  }
}

// PPTX (PowerPoint)
async function pptxBlocks(zip: Map<string, ZipFile>, out: Block[]) {
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const slides = [...zip.keys()]
    .map((k) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(k))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  for (const [path, n] of slides) {
    const doc = await xml(zip, path);
    if (!doc) continue;
    out.push({ t: 'h', level: 2, text: `Diapositiva ${n}` });
    for (const p of all(doc, 'p', A)) {
      const text = all(p, 't', A).map((t) => t.textContent ?? '').join('');
      if (text.trim()) out.push({ t: 'p', text });
    }
  }
}
