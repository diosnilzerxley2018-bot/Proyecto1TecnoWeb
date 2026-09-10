'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface PosicionFlotante {
  izquierda: number;
  ancho: number;
  hacia: 'abajo' | 'arriba';
  altoMaximo: number;
  /** Distancia al borde superior o inferior de la ventana, según `hacia`. */
  desplazamiento: number;
}

const MARGEN = 8;

/**
 * Posiciona un menú que se dibuja en un portal sobre `document.body`.
 *
 * Un menú posicionado en el flujo del documento queda recortado por cualquier
 * ancestro con `overflow` —el cuerpo desplazable de un diálogo, la barra
 * lateral—, y entonces solo se ve la primera opción. Sacarlo del flujo lo
 * resuelve, pero obliga a calcular a mano dónde ponerlo.
 *
 * Lo usan el selector de formularios y el de apariencia, que tienen el mismo
 * problema y distinta alineación.
 */
export function useMenuFlotante({
  abierto,
  alineacion = 'izquierda',
  anchoFijo,
  altoDeseado = 288,
}: {
  abierto: boolean;
  /** `izquierda` sigue el ancho del disparador; `derecha` lo alinea por su borde. */
  alineacion?: 'izquierda' | 'derecha';
  /** Ancho en píxeles cuando el menú no debe copiar el del disparador. */
  anchoFijo?: number;
  altoDeseado?: number;
}) {
  const disparador = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);
  const [posicion, setPosicion] = useState<PosicionFlotante | null>(null);

  const calcular = useCallback(() => {
    const caja = disparador.current?.getBoundingClientRect();
    if (!caja) return;

    const espacioAbajo = window.innerHeight - caja.bottom - MARGEN;
    const espacioArriba = caja.top - MARGEN;
    const cabeAbajo = espacioAbajo >= Math.min(altoDeseado, espacioArriba) || espacioAbajo >= 160;

    const ancho = anchoFijo ?? caja.width;
    const izquierda =
      alineacion === 'derecha'
        ? Math.max(MARGEN, Math.min(caja.right - ancho, window.innerWidth - ancho - MARGEN))
        : Math.max(MARGEN, Math.min(caja.left, window.innerWidth - ancho - MARGEN));

    setPosicion({
      izquierda,
      ancho,
      hacia: cabeAbajo ? 'abajo' : 'arriba',
      altoMaximo: Math.max(120, Math.min(altoDeseado, cabeAbajo ? espacioAbajo : espacioArriba)),
      desplazamiento: cabeAbajo
        ? caja.bottom + MARGEN
        : window.innerHeight - caja.top + MARGEN,
    });
  }, [alineacion, anchoFijo, altoDeseado]);

  useLayoutEffect(() => {
    if (abierto) calcular();
  }, [abierto, calcular]);

  /**
   * El menú vive fuera del contenedor que se desplaza, así que hay que
   * reubicarlo cuando ese contenedor se mueve. Se escucha en fase de captura
   * para enterarse también del desplazamiento de elementos internos.
   */
  useEffect(() => {
    if (!abierto) return;

    const reubicar = () => calcular();
    window.addEventListener('scroll', reubicar, true);
    window.addEventListener('resize', reubicar);
    return () => {
      window.removeEventListener('scroll', reubicar, true);
      window.removeEventListener('resize', reubicar);
    };
  }, [abierto, calcular]);

  /** Estilo listo para aplicar al menú, con coordenadas respecto de la ventana. */
  const estilo: React.CSSProperties | undefined = posicion
    ? {
        position: 'fixed',
        top: posicion.hacia === 'abajo' ? posicion.desplazamiento : undefined,
        bottom: posicion.hacia === 'arriba' ? posicion.desplazamiento : undefined,
        left: posicion.izquierda,
        width: posicion.ancho,
        maxHeight: posicion.altoMaximo,
      }
    : undefined;

  return { disparador, menu, posicion, estilo };
}

/** Cierra el menú al pulsar fuera del disparador y del propio menú. */
export function useCierreAlPulsarFuera(
  abierto: boolean,
  cerrar: () => void,
  ...referencias: React.RefObject<HTMLElement | null>[]
) {
  useEffect(() => {
    if (!abierto) return;

    const alPulsar = (evento: MouseEvent) => {
      const destino = evento.target as Node;
      // El menú ya no es descendiente del disparador: hay que mirar los dos.
      if (referencias.some((ref) => ref.current?.contains(destino))) return;
      cerrar();
    };

    document.addEventListener('mousedown', alPulsar);
    return () => document.removeEventListener('mousedown', alPulsar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, cerrar]);
}
