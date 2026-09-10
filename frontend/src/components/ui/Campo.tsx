'use client';

import { useId, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

interface PropsComunes {
  etiqueta: string;
  ayuda?: string;
  error?: string;
  icono?: React.ReactNode;
  /** Texto fijo al final del campo, por ejemplo la unidad de medida. */
  sufijo?: string;
}

const BASE_CONTROL =
  'peer w-full rounded-xl border bg-superficie-alta px-3.5 text-sm text-tinta ' +
  'transition-colors duration-200 outline-none placeholder:text-transparent ' +
  'focus:border-marca-500/60 focus:bg-superficie-suave disabled:opacity-50';

/**
 * Campo de texto con etiqueta flotante.
 *
 * La etiqueta viaja hacia el borde superior cuando el campo tiene foco o
 * contenido. Se apoya en `placeholder-shown`, de modo que funciona sin estado
 * de React: por eso el `placeholder` debe existir aunque sea invisible.
 */
export function Campo({
  etiqueta,
  ayuda,
  error,
  icono,
  sufijo,
  className,
  ...props
}: PropsComunes & React.InputHTMLAttributes<HTMLInputElement>) {
  const idGenerado = useId();
  const id = props.id ?? idGenerado;

  return (
    <div className={className}>
      <div className="relative">
        {icono && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-tinta-tenue peer-focus:text-marca-400">
            {icono}
          </span>
        )}

        <input
          {...props}
          id={id}
          placeholder={props.placeholder ?? etiqueta}
          className={cn(
            BASE_CONTROL,
            'h-12 pt-4',
            icono && 'pl-10',
            sufijo && 'pr-14',
            error ? 'border-peligro/50' : 'border-borde hover:border-borde-fuerte',
          )}
        />

        <label
          htmlFor={id}
          className={cn(
            'pointer-events-none absolute top-1.5 text-[10px] font-medium uppercase tracking-wider',
            'transition-all duration-200',
            icono ? 'left-10' : 'left-3.5',
            'peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2',
            'peer-placeholder-shown:text-sm peer-placeholder-shown:normal-case',
            'peer-placeholder-shown:tracking-normal peer-placeholder-shown:text-tinta-tenue',
            'peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px]',
            'peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-marca-400',
            error ? 'text-peligro' : 'text-tinta-tenue',
          )}
        >
          {etiqueta}
        </label>

        {sufijo && (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-tinta-tenue">
            {sufijo}
          </span>
        )}
      </div>

      <PieDeCampo ayuda={ayuda} error={error} />
    </div>
  );
}

export function AreaTexto({
  etiqueta,
  ayuda,
  error,
  className,
  ...props
}: PropsComunes & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const idGenerado = useId();
  const id = props.id ?? idGenerado;

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-tinta-tenue"
      >
        {etiqueta}
      </label>
      <textarea
        {...props}
        id={id}
        className={cn(
          BASE_CONTROL,
          'min-h-24 resize-y py-3 placeholder:text-tinta-tenue',
          error ? 'border-peligro/50' : 'border-borde hover:border-borde-fuerte',
        )}
      />
      <PieDeCampo ayuda={ayuda} error={error} />
    </div>
  );
}

function PieDeCampo({ ayuda, error }: { ayuda?: string; error?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {error ? (
        <motion.p
          key="error"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="mt-1.5 flex items-center gap-1.5 text-xs text-peligro"
        >
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </motion.p>
      ) : ayuda ? (
        <motion.p
          key="ayuda"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="mt-1.5 text-xs text-tinta-tenue"
        >
          {ayuda}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

/** Interruptor sin aspecto nativo, para valores booleanos. */
export function Interruptor({
  activo,
  onCambiar,
  etiqueta,
  descripcion,
}: {
  activo: boolean;
  onCambiar: (valor: boolean) => void;
  etiqueta: string;
  descripcion?: string;
}) {
  const [id] = useState(() => Math.random().toString(36).slice(2));

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-borde bg-superficie-alta px-3.5 py-3">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm text-tinta">{etiqueta}</span>
        {descripcion && <span className="mt-0.5 block text-xs text-tinta-tenue">{descripcion}</span>}
      </label>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={etiqueta}
        onClick={() => onCambiar(!activo)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-300',
          activo ? 'border-marca-500/50 bg-marca-500/30' : 'border-borde bg-white/5',
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className={cn(
            'absolute top-0.5 size-4.5 rounded-full shadow-lg',
            activo ? 'left-[22px] bg-marca-400' : 'left-0.5 bg-tinta-tenue',
          )}
        />
      </button>
    </div>
  );
}
