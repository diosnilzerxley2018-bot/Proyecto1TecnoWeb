'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useCierreAlPulsarFuera, useMenuFlotante } from './usarMenuFlotante';
import { TextoResaltado } from './TextoResaltado';
import { coincide } from '@/lib/texto';
import { cn } from '@/lib/cn';

export interface Opcion<T extends string | number> {
  valor: T;
  etiqueta: string;
  descripcion?: string;
  deshabilitada?: boolean;
}

/**
 * Con más opciones que estas, el selector trae su propio buscador.
 *
 * Por debajo, recorrer la lista con la vista es más rápido que escribir; por
 * encima —veinte insumos, treinta productos— buscar a ojo en una lista que
 * además hay que desplazar es justo lo que hacía lento elegir un ítem.
 */
const UMBRAL_BUSQUEDA = 7;

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
 *
 * Con muchas opciones, el menú trae un campo de búsqueda: filtra sin importar
 * tildes ni mayúsculas, por nombre y por descripción, y resalta lo que
 * coincide. Empezar a escribir sobre el selector cerrado lo abre ya buscando,
 * como hace el `<select>` nativo con la primera letra.
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
  buscable,
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
  /** Fuerza o suprime el buscador. Por omisión aparece con más de siete opciones. */
  buscable?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [resaltada, setResaltada] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const id = useId();
  const idLista = `${id}-lista`;
  const campo = useRef<HTMLInputElement>(null);

  const conBusqueda = buscable ?? opciones.length > UMBRAL_BUSQUEDA;

  const { disparador, menu, posicion, estilo } = useMenuFlotante({ abierto });
  const cerrar = useCallback(() => setAbierto(false), []);
  useCierreAlPulsarFuera(abierto, cerrar, disparador, menu);

  const seleccionada = opciones.find((o) => o.valor === valor) ?? null;

  const visibles = useMemo(
    () =>
      busqueda.trim() === ''
        ? opciones
        : opciones.filter((o) => coincide(`${o.etiqueta} ${o.descripcion ?? ''}`, busqueda)),
    [opciones, busqueda],
  );

  // Al cerrar se olvida lo buscado: la próxima vez se abre con la lista entera.
  useEffect(() => {
    if (!abierto) setBusqueda('');
  }, [abierto]);

  /**
   * Qué opción queda resaltada: la elegida al abrir, y la primera coincidencia
   * mientras se busca, que es la que tomaría un Enter.
   */
  useEffect(() => {
    if (!abierto) return;
    if (busqueda.trim() !== '') {
      setResaltada(0);
      return;
    }
    const indice = opciones.findIndex((o) => o.valor === valor);
    setResaltada(indice >= 0 ? indice : 0);
  }, [abierto, busqueda, opciones, valor]);

  /** Con buscador, el foco va al campo apenas el menú está en pantalla. */
  useEffect(() => {
    if (abierto && posicion && conBusqueda) campo.current?.focus();
  }, [abierto, posicion, conBusqueda]);

  /** Mantiene visible la opción resaltada al navegar con el teclado. */
  useEffect(() => {
    if (!abierto) return;
    menu.current
      ?.querySelectorAll('[data-opcion]')
      [resaltada]?.scrollIntoView({ block: 'nearest' });
  }, [abierto, resaltada, menu]);

  function elegir(opcion: Opcion<T>) {
    if (opcion.deshabilitada) return;
    onCambiar(opcion.valor);
    setAbierto(false);
    disparador.current?.focus();
  }

  function alTeclear(evento: React.KeyboardEvent) {
    if (evento.key === 'Escape') {
      if (abierto) {
        evento.preventDefault();
        setAbierto(false);
        disparador.current?.focus();
      }
      return;
    }

    if (!abierto && ['Enter', ' ', 'ArrowDown'].includes(evento.key)) {
      evento.preventDefault();
      return setAbierto(true);
    }

    // Escribir sobre el selector cerrado lo abre ya buscando esa letra.
    const esCaracter =
      evento.key.length === 1 && !evento.ctrlKey && !evento.metaKey && !evento.altKey;
    if (!abierto && conBusqueda && esCaracter) {
      evento.preventDefault();
      setBusqueda(evento.key);
      return setAbierto(true);
    }
    if (!abierto) return;

    const desdeElCampo = evento.target === campo.current;

    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setResaltada((i) => Math.min(i + 1, visibles.length - 1));
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setResaltada((i) => Math.max(i - 1, 0));
    } else if (evento.key === 'Home' && !desdeElCampo) {
      evento.preventDefault();
      setResaltada(0);
    } else if (evento.key === 'End' && !desdeElCampo) {
      evento.preventDefault();
      setResaltada(visibles.length - 1);
    } else if (evento.key === 'Enter' || evento.key === 'Tab') {
      const opcion = visibles[resaltada];
      if (opcion) {
        evento.preventDefault();
        elegir(opcion);
      }
    }
  }

  const lista = abierto && posicion && (
    <motion.div
      ref={menu as React.RefObject<HTMLDivElement>}
      initial={{ opacity: 0, y: posicion.hacia === 'abajo' ? -6 : 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: posicion.hacia === 'abajo' ? -6 : 6, scale: 0.98 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      style={estilo}
      className="z-200 flex flex-col overflow-hidden rounded-xl vidrio shadow-[0_24px_60px_-20px_rgba(0,0,0,0.95)]"
    >
      {conBusqueda && (
        <div className="shrink-0 border-b border-borde p-1.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-tinta-tenue"
              aria-hidden
            />
            <input
              ref={campo}
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={alTeclear}
              placeholder="Escriba para buscar…"
              aria-label={`Buscar en ${etiqueta}`}
              aria-controls={idLista}
              aria-activedescendant={visibles[resaltada] ? `${id}-opcion-${resaltada}` : undefined}
              autoComplete="off"
              className="h-9 w-full rounded-lg bg-white/[0.04] pl-8 pr-2 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-tenue focus:bg-white/[0.07]"
            />
          </div>
          {busqueda.trim() !== '' && (
            <p className="px-1 pt-1.5 text-[10px] tabular-nums text-tinta-tenue" aria-live="polite">
              {visibles.length} de {opciones.length}
            </p>
          )}
        </div>
      )}

      <ul
        id={idLista}
        role="listbox"
        aria-label={etiqueta}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
      >
        {visibles.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-tinta-tenue">
            {busqueda.trim() !== ''
              ? `Sin coincidencias para «${busqueda.trim()}»`
              : 'No hay opciones disponibles'}
          </li>
        )}

        {visibles.map((opcion, indice) => {
          const elegida = opcion.valor === valor;
          return (
            <li
              key={String(opcion.valor)}
              id={`${id}-opcion-${indice}`}
              role="option"
              aria-selected={elegida}
            >
              <button
                type="button"
                data-opcion
                tabIndex={-1}
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
                    <TextoResaltado texto={opcion.etiqueta} busqueda={busqueda} />
                  </span>
                  {opcion.descripcion && (
                    <span className="mt-0.5 block truncate text-xs text-tinta-tenue">
                      <TextoResaltado texto={opcion.descripcion} busqueda={busqueda} />
                    </span>
                  )}
                </span>
                {elegida && <Check className="mt-0.5 size-4 shrink-0 text-marca-400" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </motion.div>
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
        aria-controls={abierto ? idLista : undefined}
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
