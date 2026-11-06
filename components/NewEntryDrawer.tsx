import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, flattenGroups, type Group } from '@/lib/api';
import { Drawer, Field } from './Drawer';
import { Icon } from './Icon';
import { PasswordEditor } from './PasswordEditor';
import { useToast } from './Toaster';

/** Nueva entrada vía KeePassXC-Browser (set-login). */
export function NewEntryDrawer({
  open,
  initialUrl,
  groups,
  onClose,
}: {
  open: boolean;
  initialUrl?: string;
  groups: Group[];
  onClose: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ url: '', login: '', password: '', groupUuid: '' });
  const [saving, setSaving] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const flat = useMemo(() => flattenGroups(groups), [groups]);

  useEffect(() => {
    if (!open) return;
    setForm((f) => ({ ...f, url: initialUrl ?? f.url }));
    window.setTimeout(() => firstField.current?.focus(), 150);
  }, [open, initialUrl]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const group = flat.find((f) => f.group.uuid === form.groupUuid)?.group.name ?? '';
      await api('/api/logins', { method: 'POST', body: { ...form, group } });
      toast('Guardada en KeePassXC');
      setForm({ url: '', login: '', password: '', groupUuid: form.groupUuid });
      onClose();
    } catch (err) {
      toast((err as Error).message, 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} title="Nueva entrada" subtitle="Se guarda directo en tu KeePassXC" icon="plus" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-1 flex-col overflow-y-auto">
        <div className="flex-1 space-y-5 px-6 py-6">
          <Field label="Sitio" icon="globe">
            <input ref={firstField} required className="field pl-10" placeholder="https://ejemplo.com" value={form.url} onChange={set('url')} />
          </Field>

          <Field label="Usuario" icon="user">
            <input className="field pl-10" value={form.login} onChange={set('login')} autoComplete="off" placeholder="tu@correo.com" />
          </Field>

          <PasswordEditor required value={form.password} onChange={(password) => setForm((f) => ({ ...f, password }))} />

          <Field label="Grupo" icon="folder">
            <select className="field appearance-none pl-10" value={form.groupUuid} onChange={set('groupUuid')}>
              <option value="">Predeterminado (KeePassXC-Browser Passwords)</option>
              {flat.map(({ group, depth }) => (
                <option key={group.uuid} value={group.uuid}>
                  {'   '.repeat(depth) + group.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex gap-3 border-t border-zinc-200/70 px-6 py-4 dark:border-white/5">
          <button type="button" className="btn-soft flex-1" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary flex-[2]" disabled={saving}>
            {saving ? <Icon name="loader" /> : <Icon name="check" />}
            {saving ? 'Guardando…' : 'Guardar en KeePassXC'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
