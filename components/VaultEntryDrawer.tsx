import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type VaultEntry, type VaultSecret } from '@/lib/api';
import { Drawer, Field } from './Drawer';
import { Icon } from './Icon';
import { PasswordEditor } from './PasswordEditor';
import { useToast } from './Toaster';

export type EditorMode = { kind: 'new'; group: string } | { kind: 'edit'; entry: VaultEntry };

type Form = { title: string; username: string; url: string; notes: string; password: string; group: string };
const empty: Form = { title: '', username: '', url: '', notes: '', password: '', group: '' };

/** Crear o editar una entrada de la bóveda completa (se guarda en el .kdbx con keepassxc-cli). */
export function VaultEntryDrawer({
  mode,
  groups,
  rootName,
  onClose,
  onSaved,
}: {
  mode: EditorMode | null;
  groups: string[];
  rootName: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Form>(empty);
  const [original, setOriginal] = useState<Form>(empty);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  // Conserva el último modo para que el panel no cambie de título mientras se cierra
  const last = useRef<EditorMode | null>(null);
  if (mode) last.current = mode;
  const shown = mode ?? last.current;
  const editing = shown?.kind === 'edit';

  // Al abrir: formulario vacío (nueva) o datos actuales (editar; las notas se piden al backend)
  useEffect(() => {
    if (!mode) return;
    window.setTimeout(() => firstField.current?.focus(), 150);
    if (mode.kind === 'new') {
      const f = { ...empty, group: mode.group };
      setForm(f);
      setOriginal(f);
      return;
    }
    const e = mode.entry;
    const base = { title: e.title, username: e.username, url: e.url, notes: '', password: '', group: e.group };
    setForm(base);
    setOriginal(base);
    setLoading(true);
    api<VaultSecret>('/api/vault/reveal', { method: 'POST', body: { uuid: e.uuid } })
      .then((s) => {
        setForm((f) => ({ ...f, notes: s.notes }));
        setOriginal((o) => ({ ...o, notes: s.notes }));
      })
      .catch((err) => toast((err as Error).message, 'err'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // keepassxc-cli no sabe vaciar un campo: avisar antes de guardar
  const cleared = editing
    ? (['username', 'url', 'notes'] as const).filter((k) => original[k].trim() && !form[k].trim())
    : [];
  const changed = editing
    ? (Object.keys(form) as (keyof Form)[]).filter((k) => (k === 'password' ? Boolean(form.password) : form[k] !== original[k]))
    : [];
  const titleHasSlash = form.title.includes('/');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    setSaving(true);
    try {
      if (mode.kind === 'new') {
        await api('/api/vault/entries', { method: 'POST', body: form });
        toast(`"${form.title}" creada`);
      } else {
        const body = Object.fromEntries(changed.map((k) => [k, form[k]]));
        await api(`/api/vault/entries/${mode.entry.uuid}`, { method: 'PATCH', body });
        toast('Cambios guardados');
      }
      await onSaved();
      onClose();
    } catch (err) {
      toast((err as Error).message, 'err');
      await onSaved(); // el backend relee el archivo aunque falle: refrescar la vista
    } finally {
      setSaving(false);
    }
  };

  const label = (g: string) => (g.includes('/') ? g.split('/').pop()! : rootName);
  const depth = (g: string) => g.split('/').length - 1;
  const fieldHint = (k: 'username' | 'url' | 'notes') =>
    cleared.includes(k) ? <span className="text-rose-600 dark:text-rose-400">No se puede dejar vacío desde aquí; hazlo en KeePassXC.</span> : undefined;

  return (
    <Drawer
      open={Boolean(mode)}
      title={shown?.kind === 'edit' ? `Editar "${shown.entry.title}"` : 'Nueva entrada'}
      subtitle="Se guarda en tu archivo .kdbx"
      icon={editing ? 'pencil' : 'plus'}
      onClose={() => !saving && onClose()}
    >
      <form onSubmit={submit} className="flex flex-1 flex-col overflow-y-auto">
        <div className="flex-1 space-y-5 px-6 py-6">
          <Field
            label="Título"
            icon="file"
            hint={titleHasSlash ? <span className="text-rose-600 dark:text-rose-400">El título no puede llevar "/".</span> : undefined}
          >
            <input ref={firstField} required className="field pl-10" placeholder="Mi banco" value={form.title} onChange={set('title')} />
          </Field>

          <Field label="Usuario" icon="user" hint={fieldHint('username')}>
            <input className="field pl-10" value={form.username} onChange={set('username')} autoComplete="off" placeholder="tu@correo.com" />
          </Field>

          <PasswordEditor
            value={form.password}
            onChange={(password) => setForm((f) => ({ ...f, password }))}
            label={editing ? 'Nueva contraseña' : 'Contraseña'}
            placeholder={editing ? 'Déjala vacía para no cambiarla' : undefined}
          />

          <Field label="Sitio" icon="globe" hint={fieldHint('url')}>
            <input className="field pl-10" placeholder="https://ejemplo.com" value={form.url} onChange={set('url')} />
          </Field>

          <Field label="Carpeta" icon="folder">
            <select className="field appearance-none pl-10" value={form.group} onChange={set('group')}>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {'   '.repeat(depth(g)) + label(g)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Notas" hint={fieldHint('notes')}>
            <textarea
              rows={4}
              className="field resize-y"
              value={form.notes}
              onChange={set('notes')}
              disabled={loading}
              placeholder={loading ? 'Cargando…' : 'Información adicional'}
            />
          </Field>

          {shown?.kind === 'edit' && (shown.entry.fieldNames.length > 0 || shown.entry.hasTotp || shown.entry.tags.length > 0) && (
            <p className="flex items-start gap-2 rounded-2xl bg-zinc-900/[0.03] p-3 text-xs text-zinc-500 dark:bg-white/[0.03] dark:text-zinc-400">
              <Icon name="alert" className="mt-0.5 size-3.5 shrink-0" />
              Los campos extra, el TOTP y las etiquetas se conservan, pero solo se pueden cambiar en KeePassXC.
            </p>
          )}
        </div>

        <div className="border-t border-zinc-200/70 px-6 py-4 dark:border-white/5">
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Si tienes la base abierta en KeePassXC, allí se recargará sola. Guardar tarda unos segundos.
          </p>
          <div className="flex gap-3">
            <button type="button" className="btn-soft flex-1" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button
              className="btn-primary flex-[2]"
              disabled={saving || loading || titleHasSlash || cleared.length > 0 || (editing && changed.length === 0)}
            >
              {saving ? <Icon name="loader" /> : <Icon name="check" />}
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear entrada'}
            </button>
          </div>
        </div>
      </form>
    </Drawer>
  );
}
