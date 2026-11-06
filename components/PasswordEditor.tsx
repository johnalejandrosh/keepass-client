import { useState } from 'react';
import { generatePassword, strength } from '@/lib/secrets';
import { Field } from './Drawer';
import { Icon } from './Icon';

const strengthColors = ['bg-rose-500', 'bg-orange-500', 'bg-amber-400', 'bg-emerald-500', 'bg-emerald-500'];

/** Campo de contraseña con mostrar/generar, medidor de fuerza y generador configurable. */
export function PasswordEditor({
  value,
  onChange,
  required,
  label = 'Contraseña',
  placeholder,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  const [length, setLength] = useState(24);
  const [symbols, setSymbols] = useState(true);
  const st = strength(value);

  const regenerate = (len = length, sym = symbols) => {
    onChange(generatePassword({ length: len, symbols: sym }));
    setShow(true);
  };

  return (
    <>
      <div>
        <Field label={label} icon="key" hint={hint}>
          <input
            required={required}
            className="field pr-20 pl-10 font-mono"
            type={show ? 'text' : 'password'}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="new-password"
          />
          <div className="absolute top-0 right-1.5 flex h-[2.6rem] items-center">
            <button type="button" className="btn-icon size-8" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar' : 'Mostrar'}>
              <Icon name={show ? 'eyeOff' : 'eye'} />
            </button>
            <button type="button" className="btn-icon size-8" onClick={() => regenerate()} aria-label="Generar contraseña" title="Generar">
              <Icon name="sparkles" />
            </button>
          </div>
        </Field>

        {/* Medidor de fuerza */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${st ? strengthColors[st.score] : ''}`}
                  style={{ width: st && st.score >= i ? '100%' : '0%' }}
                />
              </div>
            ))}
          </div>
          <span className="w-24 text-right text-xs text-zinc-500 dark:text-zinc-400">{st ? `${st.label} · ${st.bits} bits` : '—'}</span>
        </div>
      </div>

      {/* Generador */}
      <div className="rounded-2xl bg-zinc-900/[0.03] p-4 dark:bg-white/[0.03]">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Icon name="sparkles" className="size-4 text-emerald-500" /> Generador
        </div>
        <label className="flex items-center gap-3 text-sm">
          <span className="w-16 text-zinc-500 dark:text-zinc-400">Largo</span>
          <input
            type="range"
            min={12}
            max={64}
            value={length}
            onChange={(e) => {
              const v = Number(e.target.value);
              setLength(v);
              regenerate(v, symbols);
            }}
            className="flex-1 accent-emerald-500"
          />
          <span className="w-8 text-right font-mono tabular-nums">{length}</span>
        </label>
        <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm">
          <span className="w-16 text-zinc-500 dark:text-zinc-400">Símbolos</span>
          <button
            type="button"
            role="switch"
            aria-checked={symbols}
            onClick={() => {
              setSymbols(!symbols);
              regenerate(length, !symbols);
            }}
            className={`relative h-6 w-11 rounded-full transition ${symbols ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-white/15'}`}
          >
            <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${symbols ? 'translate-x-5' : ''}`} />
          </button>
        </label>
      </div>
    </>
  );
}
