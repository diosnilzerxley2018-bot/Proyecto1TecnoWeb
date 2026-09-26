'use client';

import { useEffect, useRef } from 'react';

/**
 * Vuelve a pedir los datos cada tanto, mientras la pantalla está a la vista.
 *
 * El seguimiento de un pedido no servía de seguimiento: el cliente, el
 * repartidor y la cocina tenían que recargar la página para enterarse de que
 * algo había cambiado, y un pedido nuevo podía esperar en el tablero sin que
 * nadie lo viera.
 *
 * Solo consulta con la pestaña visible —un teléfono en el bolsillo no tiene
 * por qué gastar datos ni batería— y consulta al volver a ella, que es cuando
 * más importa lo que pasó mientras tanto.
 */
export function useRefrescoPeriodico(
  refrescar: () => unknown,
  milisegundos: number,
  activo = true,
): void {
  // La función cambia en cada dibujo; el intervalo no tiene por qué reiniciarse.
  const vigente = useRef(refrescar);
  useEffect(() => {
    vigente.current = refrescar;
  });

  useEffect(() => {
    if (!activo) return;

    const siEstaALaVista = () => {
      if (document.visibilityState === 'visible') void vigente.current();
    };

    const intervalo = window.setInterval(siEstaALaVista, milisegundos);
    document.addEventListener('visibilitychange', siEstaALaVista);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', siEstaALaVista);
    };
  }, [milisegundos, activo]);
}
