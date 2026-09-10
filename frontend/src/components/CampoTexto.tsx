'use client';

const CLASES_CONTROL =
  'w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none ' +
  'focus:border-marca-500 focus:ring-2 focus:ring-marca-500/30';

interface PropsBase {
  id: string;
  etiqueta: string;
  ayuda?: string;
}

/**
 * Campo de texto del módulo de seguridad.
 *
 * El envoltorio de `<select>` que acompañaba a este archivo se retiró: la lista
 * desplegable nativa no admite estilos y se reemplazó por `ui/Selector`.
 */

export function CampoTexto({
  id,
  etiqueta,
  ayuda,
  ...props
}: PropsBase & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-tinta-suave">
        {etiqueta}
      </label>
      <input id={id} className={CLASES_CONTROL} {...props} />
      {ayuda && <p className="mt-1 text-xs text-tinta-tenue">{ayuda}</p>}
    </div>
  );
}
