'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { useCierreAlPulsarFuera, useMenuFlotante } from './usarMenuFlotante';
import { cn } from '@/lib/cn';

export interface Opcion<T extends string | number> {
  valor: T;
  etiqueta: string;
  descripcion?: string;
  deshabilitada?: boolean;
}

/**
 * Selector construido desde cero.
 *
 * El `<select>` nativo no admite estilos en su lista desplegable —cada sistema
 * operativo la dibuja a su manera—, así que se reemplaza por un menú propio.
 * A cambio hay que reponer a mano lo que el nativo daba gratis: navegación con
 * teclado, cierre al pulsar fuera y roles de accesibilidad.
 *
 * El menú se dibuja en un portal sobre `document.body` y se posiciona con
 * coordenadas fijas calculadas a partir del disparador. Como elemento
 * posicionado en flujo quedaba recortado por cualquier ancestro con
 * `overflow` —el cuerpo desplazable de un diálogo o de un panel lateral—, y
 * entonces solo se veía la primera opción y no había forma de llegar al resto.
 */
export function Selector<T extends string | number>({
  etiqueta,
  valor,
  opciones,
  onCambiar,
  marcador = 'Seleccione…',
  ayuda,
  error,
  className,
  deshabilitado = false,
}: {
  etiqueta: string;
  valor: T | null;
  opciones: Opcion<T>[];
  onCambiar: (valor: T) => void;
  marcador?: string;
  ayuda?: string;
  error?: string;
  className?: string;
  deshabilitado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [resaltada, setResaltada] = useState(0);
  const id = useId();

  const { disparador, menu, posicion, estilo } = useMenuFlotante({ abierto });
  const cerrar = useCallback(() => setAbierto(false), []);
  useCierreAlPulsarFuera(abierto, cerrar, disparador, menu);

  const seleccionada = opciones.find((o) => o.valor === valor) ?? null;

  useEffect(() => {
    if (!abierto) return;
    const indice = opciones.findIndex((o) => o.valor === valor);
    setResaltada(indice >= 0 ? indice : 0);
  }, [abierto, opciones, valor]);

  /** Mantiene visible la opción resaltada al navegar con el teclado. */
  useEffect(() => {
    if (!abierto) return;
    menu.current
      ?.querySelectorAll('[data-opcion]')
      [resaltada]?.scrollIntoView({ block: 'nearest' });
  }, [abierto, resaltada]);

  function elegir(opcion: Opcion<T>) {
    if (opcion.deshabilitada) return;
    onCambiar(opcion.valor);
    setAbierto(false);
    disparador.current?.focus();
  }

  function alTeclear(evento: React.KeyboardEvent) {
    if (evento.key === 'Escape') return setAbierto(false);

    if (!abierto && ['Enter', ' ', 'ArrowDown'].includes(evento.key)) {
      evento.preventDefault();
      return setAbierto(true);
    }
    if (!abierto) return;

    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setResaltada((i) => Math.min(i + 1, opciones.length - 1));
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setResaltada((i) => Math.max(i - 1, 0));
    } else if (evento.key === 'Home') {
      evento.preventDefault();
      setResaltada(0);
    } else if (evento.key === 'End') {
      evento.preventDefault();
      setResaltada(opciones.length - 1);
    } else if (evento.key === 'Enter' || evento.key === 'Tab') {
      const opcion = opciones[resaltada];
      if (opcion) {
        evento.preventDefault();
        elegir(opcion);
      }
    }
  }

  const lista = abierto && posicion && (
    <motion.ul
      ref={menu as React.RefObject<HTMLUListElement>}
      role="listbox"
      aria-label={etiqueta}
      initial={{ opacity: 0, y: posicion.hacia === 'abajo' ? -6 : 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: posicion.hacia === 'abajo' ? -6 : 6, scale: 0.98 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      style={estilo}
      className="z-200 overflow-y-auto overscroll-contain rounded-xl p-1.5 vidrio shadow-[0_24px_60px_-20px_rgba(0,0,0,0.95)]"
    >
      {opciones.length === 0 && (
        <li className="px-3 py-6 text-center text-xs text-tinta-tenue">
          No hay opciones disponibles
        </li>
      )}

      {opciones.map((opcion, indice) => {
        const elegida = opcion.valor === valor;
        return (
          <li key={String(opcion.valor)} role="option" aria-selected={elegida}>
            <button
              type="button"
              data-opcion
              disabled={opcion.deshabilitada}
              onMouseEnter={() => setResaltada(indice)}
              onClick={() => elegir(opcion)}
              className={cn(
                'flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left',
                'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
                indice === resaltada && !opcion.deshabilitada && 'bg-white/[0.06]',
              )}
            >
              <span className="min-w-0">
                <span
                  className={cn(
                    'block truncate text-sm',
                    elegida ? 'text-marca-300' : 'text-tinta',
                  )}
                >
                  {opcion.etiqueta}
                </span>
                {opcion.descripcion && (
                  <span className="mt-0.5 block truncate text-xs text-tinta-tenue">
                    {opcion.descripcion}
                  </span>
                )}
              </span>
              {elegida && <Check className="mt-0.5 size-4 shrink-0 text-marca-400" aria-hidden />}
            </button>
          </li>
        );
      })}
    </motion.ul>
  );

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-tinta-tenue"
      >
        {etiqueta}
      </label>

      <button
        ref={disparador}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={abierto}
        aria-haspopup="listbox"
        disabled={deshabilitado}
        onClick={() => setAbierto((v) => !v)}
        onKeyDown={alTeclear}
        className={cn(
          'flex h-12 w-full items-center justify-between gap-2 rounded-xl border px-3.5',
          'bg-superficie-alta text-left text-sm transition-colors duration-200',
          'hover:border-borde-fuerte disabled:cursor-not-allowed disabled:opacity-50',
          abierto ? 'border-marca-500/60 bg-superficie-suave' : 'border-borde',
          error && 'border-peligro/50',
        )}
      >
        <span className={cn('truncate', seleccionada ? 'text-tinta' : 'text-tinta-tenue')}>
          {seleccionada?.etiqueta ?? marcador}
        </span>
        <motion.span
          animate={{ rotate: abierto ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-tinta-tenue"
        >
          <ChevronDown className="size-4" aria-hidden />
        </motion.span>
      </button>

      {typeof document !== 'undefined' &&
        createPortal(<AnimatePresence>{lista}</AnimatePresence>, document.body)}

      {error ? (
        <p className="mt-1.5 text-xs text-peligro">{error}</p>
      ) : ayuda ? (
        <p className="mt-1.5 text-xs text-tinta-tenue">{ayuda}</p>
      ) : null}
    </div>
  );
}
