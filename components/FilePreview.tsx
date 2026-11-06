import { useEffect, useState } from 'react';
import { CATEGORY_LABEL, categoryOf, formatBytes, renderFile, urlsOf, type Block, type Rendered } from '@/lib/preview';
import { FileBadge } from './FileBadge';
import { Icon } from './Icon';

/**
 * Visor de adjuntos a pantalla completa: muestra el archivo sin descargarlo y permite pasar
 * al anterior/siguiente (flechas ← →). Esc cierra.
 */
export function FilePreview({
  files,
  index,
  load,
  onIndex,
  onDownload,
  onRemove,
  onClose,
}: {
  files: string[];
  index: number;
  load: (name: string) => Promise<Blob>;
  onIndex: (i: number) => void;
  onDownload: (name: string) => void;
  onRemove: (name: string) => void;
  onClose: () => void;
}) {
  const name = files[index];
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ok'; r: Rendered; size: number } | { status: 'error'; msg: string }>({
    status: 'loading',
  });
  const [tab, setTab] = useState<'content' | 'page'>('content');
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let alive = true;
    let rendered: Rendered | null = null;
    setState({ status: 'loading' });
    setTab('content');
    setZoom(false);
    load(name)
      .then(async (blob) => {
        rendered = await renderFile(name, blob);
        if (alive) setState({ status: 'ok', r: rendered, size: blob.size });
        else urlsOf(rendered).forEach(URL.revokeObjectURL);
      })
      .catch((e) => alive && setState({ status: 'error', msg: (e as Error).message }));
    return () => {
      alive = false;
      urlsOf(rendered).forEach(URL.revokeObjectURL); // libera las URLs temporales
    };
  }, [name, load]);

  // Teclado en fase de captura: así Esc no llega a los atajos de la vista de fondo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < files.length - 1) onIndex(index + 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, files.length, onIndex, onClose]);

  const r = state.status === 'ok' ? state.r : null;
  const thumb = r?.kind === 'doc' ? r.thumb : undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:p-6" role="dialog" aria-modal="true" aria-label={`Vista previa de ${name}`}>
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 animate-pop flex-col overflow-hidden bg-white shadow-2xl sm:rounded-3xl dark:bg-zinc-900">
        {/* Cabecera */}
        <div className="flex items-center gap-3 border-b border-zinc-200/70 px-4 py-3 dark:border-white/10">
          <FileBadge name={name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium" title={name}>
              {name}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {CATEGORY_LABEL[categoryOf(name)]}
              {state.status === 'ok' && ` · ${formatBytes(state.size)}`}
              {files.length > 1 && ` · ${index + 1} de ${files.length}`}
            </p>
          </div>
          <button className="btn-soft py-1.5" onClick={() => onDownload(name)} title="Descargar">
            <Icon name="download" /> <span className="max-sm:hidden">Descargar</span>
          </button>
          <button
            className="btn-icon hover:text-rose-600! dark:hover:text-rose-400!"
            onClick={() => onRemove(name)}
            title="Quitar adjunto"
            aria-label="Quitar adjunto"
          >
            <Icon name="trash" />
          </button>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar vista previa" title="Cerrar (Esc)">
            <Icon name="x" className="size-5" />
          </button>
        </div>

        {/* Pestañas: contenido / primera página (si el documento trae miniatura) */}
        {thumb && (
          <div className="flex gap-1 border-b border-zinc-200/70 px-4 py-2 dark:border-white/10">
            {(
              [
                ['content', 'Contenido'],
                ['page', 'Primera página'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`rounded-lg px-3 py-1 text-sm transition ${
                  tab === id ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-500 hover:bg-zinc-900/5 dark:hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Cuerpo */}
        <div className="relative min-h-0 flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-950">
          {state.status === 'loading' && (
            <div className="grid h-full min-h-60 place-items-center text-zinc-400">
              <span className="flex items-center gap-2 text-sm">
                <Icon name="loader" className="size-5" /> Abriendo…
              </span>
            </div>
          )}
          {state.status === 'error' && <NoPreview name={name} text={state.msg} onDownload={onDownload} />}
          {r && tab === 'page' && thumb && (
            <div className="grid min-h-full place-items-center p-6">
              <img src={thumb} alt="Primera página" className="max-w-full rounded-lg bg-white shadow-xl ring-1 ring-zinc-900/10" />
            </div>
          )}
          {r && tab === 'content' && <Body r={r} name={name} zoom={zoom} onZoom={() => setZoom(!zoom)} onDownload={onDownload} />}
        </div>

        {/* Navegación */}
        {files.length > 1 && (
          <>
            <NavButton side="left" disabled={index === 0} onClick={() => onIndex(index - 1)} />
            <NavButton side="right" disabled={index === files.length - 1} onClick={() => onIndex(index + 1)} />
          </>
        )}
      </div>
    </div>
  );
}

function NavButton({ side, disabled, onClick }: { side: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
  if (disabled) return null;
  return (
    <button
      onClick={onClick}
      aria-label={side === 'left' ? 'Anterior' : 'Siguiente'}
      title={side === 'left' ? 'Anterior (←)' : 'Siguiente (→)'}
      className={`absolute top-1/2 ${side === 'left' ? 'left-3' : 'right-3'} grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-zinc-700 shadow-lg ring-1 ring-zinc-900/10 backdrop-blur transition hover:scale-105 hover:bg-white dark:bg-zinc-800/90 dark:text-zinc-200 dark:ring-white/10`}
    >
      <Icon name={side === 'left' ? 'chevronLeft' : 'chevronRight'} className="size-5" />
    </button>
  );
}

function NoPreview({ name, text, onDownload }: { name: string; text: string; onDownload: (n: string) => void }) {
  return (
    <div className="grid h-full min-h-72 place-items-center p-8 text-center">
      <div>
        <div className="mx-auto mb-4 w-fit">
          <FileBadge name={name} size="lg" />
        </div>
        <p className="font-medium">Sin vista previa</p>
        <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{text}</p>
        <button className="btn-primary mt-5" onClick={() => onDownload(name)}>
          <Icon name="download" /> Descargar
        </button>
      </div>
    </div>
  );
}

function Body({ r, name, zoom, onZoom, onDownload }: { r: Rendered; name: string; zoom: boolean; onZoom: () => void; onDownload: (n: string) => void }) {
  switch (r.kind) {
    case 'image':
      return (
        <div
          className={`min-h-full bg-[length:20px_20px] bg-[position:0_0,10px_10px] p-4 [background-image:linear-gradient(45deg,rgb(0_0_0/0.04)_25%,transparent_25%,transparent_75%,rgb(0_0_0/0.04)_75%),linear-gradient(45deg,rgb(0_0_0/0.04)_25%,transparent_25%,transparent_75%,rgb(0_0_0/0.04)_75%)] ${
            zoom ? '' : 'grid place-items-center'
          }`}
        >
          <img
            src={r.url}
            alt={name}
            onClick={onZoom}
            title={zoom ? 'Ajustar a la ventana' : 'Ver a tamaño real'}
            className={`rounded-lg shadow-lg ${zoom ? 'max-w-none cursor-zoom-out' : 'max-h-[72dvh] max-w-full cursor-zoom-in object-contain'}`}
          />
        </div>
      );
    case 'pdf':
      return <iframe src={r.url} title={name} className="block h-full min-h-[72dvh] w-full" />;
    case 'video':
      return (
        <div className="grid min-h-full place-items-center bg-black p-4">
          <video src={r.url} controls className="max-h-[72dvh] max-w-full" />
        </div>
      );
    case 'audio':
      return (
        <div className="grid min-h-72 place-items-center p-8">
          <div className="w-full max-w-md text-center">
            <div className="mx-auto mb-6 w-fit">
              <FileBadge name={name} size="lg" />
            </div>
            <audio src={r.url} controls className="w-full" />
          </div>
        </div>
      );
    case 'text':
      return (
        <>
          {r.truncated && <Notice>El archivo es grande: se muestran solo los primeros 512 KB.</Notice>}
          <pre className="min-h-full bg-white p-5 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {r.text}
          </pre>
        </>
      );
    case 'zip':
      return (
        <div className="mx-auto max-w-2xl p-4 sm:p-6">
          <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
            {r.files.length} {r.files.length === 1 ? 'archivo' : 'archivos'} dentro del comprimido
          </p>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl bg-white text-sm ring-1 ring-zinc-900/5 dark:divide-white/5 dark:bg-zinc-900 dark:ring-white/10">
            {r.files.slice(0, 1000).map((f) => (
              <li key={f.name} className="flex items-center gap-3 px-4 py-2">
                <FileBadge name={f.name} size="sm" />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]" title={f.name}>
                  {f.name}
                </span>
                <span className="shrink-0 text-xs text-zinc-400 tabular-nums">{formatBytes(f.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'doc':
      return (
        <>
          <Notice>Vista simplificada: texto, títulos, listas y tablas. Descárgalo para ver el formato exacto.</Notice>
          <div className="p-3 sm:p-8">
            <article className="mx-auto max-w-3xl rounded-lg bg-white px-6 py-8 text-[15px] leading-relaxed text-zinc-800 shadow-xl ring-1 ring-zinc-900/5 sm:px-12 sm:py-12">
              {r.blocks.length === 0 ? (
                <p className="text-center text-zinc-400">El documento no tiene texto.</p>
              ) : (
                <DocBlocks blocks={r.blocks} />
              )}
              {r.truncated && <p className="mt-6 text-center text-xs text-zinc-400">… el documento sigue. Descárgalo para verlo completo.</p>}
            </article>
          </div>
        </>
      );
    case 'none':
      return <NoPreview name={name} text={r.reason} onDownload={onDownload} />;
  }
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-amber-500/20 bg-amber-50/95 px-4 py-2 text-xs text-amber-800 backdrop-blur dark:bg-amber-950/80 dark:text-amber-300">
      <Icon name="alert" className="size-3.5 shrink-0" /> {children}
    </div>
  );
}

const headingClass = ['', 'text-2xl font-bold mt-6 mb-3', 'text-xl font-semibold mt-6 mb-2', 'text-lg font-semibold mt-5 mb-2', 'font-semibold mt-4 mb-1'];

function DocBlocks({ blocks }: { blocks: Block[] }) {
  // Agrupa los elementos de lista consecutivos en un <ul>
  const out: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.t === 'li') {
      const items: string[] = [];
      while (i < blocks.length && blocks[i].t === 'li') items.push((blocks[i++] as { text: string }).text);
      i--;
      out.push(
        <ul key={i} className="my-2 list-disc space-y-1 pl-6 marker:text-zinc-400">
          {items.map((t, j) => (
            <li key={j} className="whitespace-pre-wrap">
              {t}
            </li>
          ))}
        </ul>,
      );
    } else if (b.t === 'h') {
      out.push(
        <p key={i} role="heading" aria-level={b.level} className={`whitespace-pre-wrap first:mt-0 ${headingClass[b.level] ?? headingClass[4]}`}>
          {b.text}
        </p>,
      );
    } else if (b.t === 'p') {
      out.push(
        <p key={i} className="my-2 whitespace-pre-wrap">
          {b.text}
        </p>,
      );
    } else if (b.rows.length) {
      out.push(<DocTable key={i} table={b} />);
    }
  }
  return <>{out}</>;
}

function DocTable({ table }: { table: Extract<Block, { t: 'table' }> }) {
  return (
    <figure className="my-4">
      {table.name && <figcaption className="mb-1.5 text-sm font-semibold text-zinc-600">{table.name}</figcaption>}
      <div className="overflow-x-auto rounded-lg ring-1 ring-zinc-200">
        <table className="min-w-full border-collapse text-[13px]">
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className={i === 0 ? 'bg-zinc-50 font-medium' : 'even:bg-zinc-50/50'}>
                {row.map((cell, j) => (
                  <td key={j} className="max-w-xs border border-zinc-200 px-2.5 py-1.5 align-top whitespace-pre-wrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.truncated && <p className="mt-1 text-xs text-zinc-400">Se muestran las primeras filas.</p>}
    </figure>
  );
}
