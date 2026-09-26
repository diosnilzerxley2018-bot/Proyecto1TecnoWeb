'use client';

import { useEffect, useState } from 'react';

/**
 * El mismo valor, pero con retardo: cambia cuando deja de cambiar durante `ms`.
 *
 * Es para las búsquedas que resuelve el servidor. Sin retardo, escribir
 * «camila» hacía seis consultas, una por letra, y la pantalla parpadeaba
 * mostrando resultados de «c», «ca», «cam»… que nadie había pedido.
 */
export function useRetardo<T>(valor: T, ms = 300): T {
  const [retardado, setRetardado] = useState(valor);

  useEffect(() => {
    const temporizador = setTimeout(() => setRetardado(valor), ms);
    return () => clearTimeout(temporizador);
  }, [valor, ms]);

  return retardado;
}
