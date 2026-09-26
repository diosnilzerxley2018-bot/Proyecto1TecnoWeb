'use client';

import { useEffect, useEffectEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Atiende un enlace directo a esta pantalla: `?buscar=`, `?pedido=`, `?almacen=`…
 *
 * El parámetro es una orden de una sola vez —«abra el pedido 5», «busque
 * avena»—, no el estado de la pantalla: se aplica y se quita de la dirección.
 * Así, elegir en el buscador general algo de la pantalla en la que ya se está
 * vuelve a funcionar —la dirección cambia aunque la página no se monte de
 * nuevo—, y cerrar el panel no deja en la barra un `?pedido=` que lo
 * reabriría al recargar.
 *
 * Devuelve los valores presentes al dibujar, para que la pantalla arranque
 * ya filtrada en vez de consultar dos veces: una sin filtro y otra con él.
 */
export function useEnlaceDirecto<N extends string>(
  nombres: readonly N[],
  alRecibir: (valores: Partial<Record<N, string>>) => void,
): Partial<Record<N, string>> {
  const parametros = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();

  const valores: Partial<Record<N, string>> = {};
  for (const nombre of nombres) {
    const valor = parametros.get(nombre);
    if (valor !== null) valores[nombre] = valor;
  }

  // Una cadena estable: el efecto corre cuando cambian los valores, no en cada dibujo.
  const firma = new URLSearchParams(valores as Record<string, string>).toString();

  const aplicar = useEffectEvent(() => {
    alRecibir(valores);

    // Se quitan solo los parámetros atendidos; los demás siguen en la dirección.
    const resto = new URLSearchParams(parametros.toString());
    for (const nombre of nombres) resto.delete(nombre);
    const consulta = resto.toString();
    router.replace(consulta ? `${ruta}?${consulta}` : ruta, { scroll: false });
  });

  useEffect(() => {
    if (firma !== '') aplicar();
  }, [firma]);

  return valores;
}
