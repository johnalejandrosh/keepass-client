import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

export type MenuItem =
  | { label: string; icon?: IconName; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string }
  | 'sep';

export interface MenuRequest {
  x: number;
  y: number;
  title?: string;
  items: MenuItem[];
}

/** Abre el menú en la posición del ratón (clic derecho) o bajo el botón que lo lanzó. */
export function menuAt(ev: { clientX: number; clientY: number; currentTarget: EventTarget | null; type: string }) {
  if (ev.type === 'contextmenu' && (ev.clientX || ev.clientY)) return { x: ev.clientX, y: ev.clientY };
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: r.right, y: r.bottom + 4, alignRight: true };
}

/** Menú contextual flotante: teclado (↑ ↓ Enter Esc), se cierra al hacer clic fuera o al desplazar. */
export function ContextMenu({ request, onClose }: { request: (MenuRequest & { alignRight?: boolean }) | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Ajusta la posición para que no se salga de la ventana
  useLayoutEffect(() => {
    if (!request || !ref.current) return setPos(null);
    const { width, height } = ref.current.getBoundingClientRect();
    let left = request.alignRight ? request.x - width : request.x;
    let top = request.y;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    if (top + height > window.innerHeight - 8) top = Math.max(8, request.y - height - (request.alignRight ? 40 : 0));
    setPos({ left, top });
    ref.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const close = () => onClose();
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => {
      const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape' || e.key === 'Tab') onClose();
      else if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
      else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
      else return;
      e.preventDefault();
      e.stopPropagation(); // que no lo reciban los atajos de la página
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [request, onClose]);

  if (!request) return null;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={request.title ?? 'Opciones'}
      style={{ left: pos?.left ?? request.x, top: pos?.top ?? request.y, visibility: pos ? 'visible' : 'hidden' }}
      className="fixed z-[60] min-w-56 animate-pop rounded-2xl border border-zinc-200/80 bg-white/95 p-1.5 shadow-2xl shadow-zinc-900/15 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/95 dark:shadow-black/50"
      onContextMenu={(e) => e.preventDefault()}
    >
      {request.title && (
        <p className="truncate px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">{request.title}</p>
      )}
      {request.items.map((item, i) =>
        item === 'sep' ? (
          <div key={i} className="my-1 h-px bg-zinc-200/80 dark:bg-white/10" />
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm outline-none transition disabled:opacity-40 ${
              item.danger
                ? 'text-rose-600 hover:bg-rose-500/10 focus:bg-rose-500/10 dark:text-rose-400'
                : 'text-zinc-700 hover:bg-zinc-900/5 focus:bg-zinc-900/5 dark:text-zinc-200 dark:hover:bg-white/10 dark:focus:bg-white/10'
            }`}
          >
            {item.icon ? <Icon name={item.icon} className="size-4 shrink-0 opacity-70" /> : <span className="size-4" />}
            <span className="flex-1">{item.label}</span>
            {item.hint && <span className="kbd">{item.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}
