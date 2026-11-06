import { categoryOf, extOf, type Category } from '@/lib/preview';

/** Color por tipo de archivo (fondo suave + texto). */
export const CATEGORY_TONE: Record<Category, string> = {
  image: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  pdf: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
  doc: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  sheet: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  slides: 'bg-orange-500/12 text-orange-600 dark:text-orange-400',
  audio: 'bg-pink-500/12 text-pink-600 dark:text-pink-400',
  video: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400',
  archive: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  text: 'bg-zinc-500/12 text-zinc-600 dark:text-zinc-300',
  key: 'bg-teal-500/12 text-teal-600 dark:text-teal-400',
  other: 'bg-zinc-500/12 text-zinc-500 dark:text-zinc-400',
};

/** Icono de documento con la extensión, coloreado según el tipo. */
export function FileBadge({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const ext = extOf(name).slice(0, 4).toUpperCase() || 'FILE';
  const dims = { sm: 'h-9 w-7 text-[8px]', md: 'h-14 w-11 text-[10px]', lg: 'h-20 w-16 text-xs' }[size];
  return (
    <span className={`relative inline-grid shrink-0 place-items-end rounded-md pb-1.5 font-bold tracking-wide ${dims} ${CATEGORY_TONE[categoryOf(name)]}`}>
      {/* esquina doblada */}
      <span className="absolute top-0 right-0 size-[30%] rounded-bl-md bg-white/60 dark:bg-white/10" />
      <span className="w-full text-center">{ext}</span>
    </span>
  );
}
