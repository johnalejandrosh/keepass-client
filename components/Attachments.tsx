import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { api, apiBlob, attachmentUrl } from '@/lib/api';
import { CATEGORY_LABEL, categoryOf, formatBytes, hasThumbnail, thumbnailOf } from '@/lib/preview';
import type { DialogRequest } from './Dialog';
import { FileBadge } from './FileBadge';
import { FilePreview } from './FilePreview';
import { Icon } from './Icon';
import { useToast } from './Toaster';

const MAX_BYTES = 16 * 1024 * 1024;
const MAX_THUMB_BYTES = 12 * 1024 * 1024;


// --- Caché de adjuntos descargados (solo en memoria, se vacía al cerrar la bóveda) -----------
// Cada adjunto se pide una vez por versión de la base: miniatura, visor y descarga lo comparten.
const cache = new Map<string, Promise<Blob>>();
export const clearAttachmentCache = () => cache.clear();

function fetchAttachment(uuid: string, name: string, version: number) {
  const key = `${version}\u0000${uuid}\u0000${name}`;
  let p = cache.get(key);
  if (!p) {
    p = apiBlob(attachmentUrl(uuid, name));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });
}

type FileInfo = { name: string; size: number | null };

/** Adjuntos de una entrada: miniaturas, visor sin descargar, arrastrar para adjuntar. */
export function Attachments({
  uuid,
  files,
  version,
  onChanged,
  ask,
}: {
  uuid: string;
  files: FileInfo[];
  version: number;
  onChanged: () => Promise<void> | void;
  ask: (r: DialogRequest) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const load = useCallback((name: string) => fetchAttachment(uuid, name, version), [uuid, version]);

  const download = async (name: string) => {
    try {
      const url = URL.createObjectURL(await load(name));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  // --- Subir (uno o varios; pregunta antes de reemplazar) ---
  const uploadAll = async (list: File[], overwrite: boolean) => {
    setUploading((u) => [...u, ...list.map((f) => f.name)]);
    let ok = 0;
    for (const file of list) {
      try {
        const data = await readBase64(file);
        await api(`/api/vault/entries/${uuid}/attachments`, { method: 'POST', body: { name: file.name, data, overwrite } });
        ok++;
      } catch (e) {
        toast(`${file.name}: ${(e as Error).message}`, 'err');
      } finally {
        setUploading((u) => u.filter((n) => n !== file.name));
      }
    }
    if (ok) toast(ok === 1 ? `"${list[0].name}" adjuntado` : `${ok} archivos adjuntados`);
    await onChanged();
  };

  const add = (picked: File[]) => {
    if (input.current) input.current.value = '';
    const tooBig = picked.filter((f) => f.size > MAX_BYTES);
    if (tooBig.length) toast(`Supera 16 MB: ${tooBig.map((f) => f.name).join(', ')}`, 'err');
    const valid = picked.filter((f) => f.size <= MAX_BYTES);
    const fresh = valid.filter((f) => !files.some((x) => x.name === f.name));
    const clash = valid.filter((f) => files.some((x) => x.name === f.name));
    if (fresh.length) void uploadAll(fresh, false);
    if (!clash.length) return;
    ask({
      title: clash.length === 1 ? `¿Reemplazar "${clash[0].name}"?` : `¿Reemplazar ${clash.length} archivos?`,
      text:
        clash.length === 1
          ? 'Ya hay un adjunto con ese nombre en esta entrada.'
          : `Ya existen: ${clash.map((f) => f.name).join(', ')}.`,
      icon: 'paperclip',
      confirmLabel: 'Reemplazar',
      onConfirm: () => uploadAll(clash, true),
    });
  };

  const remove = (name: string) =>
    ask({
      title: `¿Quitar "${name}"?`,
      text: 'El archivo se quitará de esta entrada.',
      danger: true,
      confirmLabel: 'Quitar adjunto',
      onConfirm: async () => {
        try {
          await api(`/api/vault/entries/${uuid}/attachments/${encodeURIComponent(name)}`, { method: 'DELETE' });
          toast(`"${name}" quitado`);
          setViewing(null);
        } catch (e) {
          toast((e as Error).message, 'err');
          throw e;
        } finally {
          await onChanged();
        }
      },
    });

  // --- Arrastrar y soltar ---
  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  };
  const onDragLeave = () => {
    if (--dragDepth.current <= 0) (dragDepth.current = 0), setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const list = Array.from(e.dataTransfer.files);
    if (list.length) add(list);
  };

  const names = files.map((f) => f.name);

  return (
    <section
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative rounded-2xl bg-zinc-900/[0.03] p-3 dark:bg-white/[0.03]"
      aria-label="Adjuntos"
    >
      <div className="mb-3 flex items-center gap-2 px-1">
        <Icon name="paperclip" className="size-4 text-zinc-400" />
        <h4 className="text-sm font-medium">Adjuntos</h4>
        {files.length > 0 && (
          <span className="rounded-full bg-zinc-900/5 px-1.5 py-px text-xs text-zinc-500 tabular-nums dark:bg-white/10 dark:text-zinc-400">
            {files.length}
          </span>
        )}
        <span className="flex-1" />
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => add(Array.from(e.target.files ?? []))} />
        <button className="btn-soft px-2.5 py-1 text-xs" onClick={() => input.current?.click()}>
          <Icon name="plus" className="size-3.5" /> Adjuntar
        </button>
      </div>

      {files.length === 0 && uploading.length === 0 ? (
        <button
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500 transition hover:border-emerald-400 hover:bg-emerald-500/5 hover:text-emerald-700 dark:border-white/10 dark:text-zinc-400 dark:hover:text-emerald-400"
        >
          <Icon name="paperclip" className="size-5" />
          <span className="font-medium">Arrastra archivos aquí</span>
          <span className="text-xs opacity-80">o pulsa para elegirlos · máx. 16 MB</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((f, i) => (
            <Tile
              key={f.name}
              file={f}
              load={load}
              onOpen={() => setViewing(i)}
              onDownload={() => download(f.name)}
              onRemove={() => remove(f.name)}
            />
          ))}
          {uploading.map((n) => (
            <div key={`up-${n}`} className="flex flex-col overflow-hidden rounded-xl bg-white ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10">
              <div className="grid aspect-[4/3] place-items-center bg-zinc-50 text-zinc-400 dark:bg-white/[0.03]">
                <Icon name="loader" className="size-5" />
              </div>
              <div className="px-2.5 py-2">
                <p className="truncate text-[13px] font-medium">{n}</p>
                <p className="text-[11px] text-zinc-400">Adjuntando…</p>
              </div>
            </div>
          ))}
          <button
            onClick={() => input.current?.click()}
            className="flex aspect-auto min-h-28 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 text-xs text-zinc-500 transition hover:border-emerald-400 hover:bg-emerald-500/5 hover:text-emerald-700 dark:border-white/10 dark:text-zinc-400 dark:hover:text-emerald-400"
          >
            <Icon name="plus" className="size-5" />
            Añadir o arrastrar
          </button>
        </div>
      )}

      {/* Capa al arrastrar archivos encima */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 grid animate-pop place-items-center rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-500/10 backdrop-blur-[2px]">
          <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-emerald-700 shadow-lg dark:bg-zinc-900 dark:text-emerald-400">
            <Icon name="paperclip" /> Suelta para adjuntar
          </span>
        </div>
      )}

      {viewing !== null && names[viewing] && (
        <FilePreview
          files={names}
          index={viewing}
          load={load}
          onIndex={setViewing}
          onDownload={download}
          onRemove={remove}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}

/** Tarjeta de un adjunto: miniatura (si hay), nombre, tipo y tamaño. Pulsar abre el visor. */
function Tile({
  file,
  load,
  onOpen,
  onDownload,
  onRemove,
}: {
  file: FileInfo;
  load: (name: string) => Promise<Blob>;
  onOpen: () => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [size, setSize] = useState<number | null>(file.size);

  // Miniatura: solo para imágenes y documentos de oficina (traen una dentro)
  useEffect(() => {
    if (!hasThumbnail(file.name) || (file.size ?? 0) > MAX_THUMB_BYTES) return;
    let alive = true;
    let url: string | null = null;
    load(file.name)
      .then(async (blob) => {
        if (!alive) return;
        setSize(blob.size);
        url = await thumbnailOf(file.name, blob);
        if (alive) setThumb(url);
        else if (url) URL.revokeObjectURL(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.name, file.size, load]);

  const cat = categoryOf(file.name);
  const meta = [CATEGORY_LABEL[cat], size !== null ? formatBytes(size) : null].filter(Boolean).join(' · ');

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl bg-white ring-1 ring-zinc-900/5 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-emerald-400/50 dark:bg-zinc-900 dark:ring-white/10">
      <button onClick={onOpen} className="flex flex-1 flex-col text-left" title={`Ver ${file.name}`}>
        <div className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden bg-zinc-50 dark:bg-white/[0.03]">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              className={`size-full ${cat === 'image' ? 'object-cover' : 'object-contain object-top p-2'} transition duration-300 group-hover:scale-[1.03]`}
            />
          ) : (
            <FileBadge name={file.name} />
          )}
          <span className="absolute inset-0 grid place-items-center bg-zinc-950/0 opacity-0 transition group-hover:bg-zinc-950/25 group-hover:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-zinc-800 shadow">
              <Icon name="eye" className="size-3.5" /> Ver
            </span>
          </span>
        </div>
        <div className="min-w-0 px-2.5 py-2">
          <p className="line-clamp-2 text-[13px] leading-snug font-medium break-all" title={file.name}>
            {file.name}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{meta}</p>
        </div>
      </button>

      {/* Acciones rápidas (siempre visibles en pantallas táctiles pequeñas) */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <button
          onClick={onDownload}
          className="grid size-7 place-items-center rounded-lg bg-white/95 text-zinc-600 shadow ring-1 ring-zinc-900/5 hover:text-zinc-900 dark:bg-zinc-800/95 dark:text-zinc-300 dark:hover:text-white"
          title="Descargar"
          aria-label={`Descargar ${file.name}`}
        >
          <Icon name="download" className="size-3.5" />
        </button>
        <button
          onClick={onRemove}
          className="grid size-7 place-items-center rounded-lg bg-white/95 text-zinc-600 shadow ring-1 ring-zinc-900/5 hover:text-rose-600 dark:bg-zinc-800/95 dark:text-zinc-300 dark:hover:text-rose-400"
          title="Quitar"
          aria-label={`Quitar ${file.name}`}
        >
          <Icon name="trash" className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
