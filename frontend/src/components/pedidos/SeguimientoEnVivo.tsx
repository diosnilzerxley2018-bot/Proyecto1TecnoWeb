'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { distanciaEnMetros, formatearDistancia } from '@/lib/geo';
import { formatearAntiguedad } from '@/lib/formato';
import type { Coordenadas } from '@/lib/dominio';
import type { SeguimientoPedido } from '@/types';
import { useRefrescoPeriodico } from '@/components/ui/usarRefrescoPeriodico';
import { cn } from '@/lib/cn';
import { MapaUbicacion, type PuntoRepartidor } from './MapaUbicacion';

/** Cada cuánto se vuelve a preguntar: el teléfono del repartidor envía cada quince segundos. */
const CADA_MS = 15_000;

/**
 * Pasado este tiempo sin noticias, la posición se muestra como vieja: el
 * teléfono pudo perder la señal o cerrar la aplicación.
 */
const VIEJA_SEGUNDOS = 120;

/**
 * El pedido en camino, en el mapa: el destino y por dónde viene el repartidor.
 *
 * Lo usan el cliente, que quiere saber si de verdad viene, y el personal, que
 * quiere saber dónde está su reparto. La ruta de la API es lo único que
 * cambia entre los dos: cada lado pregunta con su propio alcance.
 */
export function SeguimientoEnVivo({
  ruta,
  destino,
  para,
  altura = 'h-64 sm:h-72',
}: {
  /** `/pedidos/:id/seguimiento` para el cliente, `/gestion/pedidos/:id/seguimiento` para el personal. */
  ruta: string;
  destino: Coordenadas | null;
  para: 'cliente' | 'personal';
  altura?: string;
}) {
  const [seguimiento, setSeguimiento] = useState<SeguimientoPedido | null>(null);

  const consultar = useCallback(async () => {
    try {
      setSeguimiento(await api.get<SeguimientoPedido>(ruta));
    } catch {
      // Si una consulta falla se conserva lo último que se supo: el mapa no
      // tiene por qué quedar en blanco por un corte de un momento.
    }
  }, [ruta]);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  useRefrescoPeriodico(consultar, CADA_MS);

  const posicion = seguimiento?.posicion ?? null;
  const vieja = posicion !== null && posicion.antiguedadSegundos > VIEJA_SEGUNDOS;

  const punto: PuntoRepartidor | null = posicion && {
    lat: posicion.latitud,
    lon: posicion.longitud,
    precision: posicion.precision,
    vieja,
  };

  const distancia = punto && destino ? formatearDistancia(distanciaEnMetros(punto, destino)) : null;

  return (
    <div className="space-y-2">
      <MapaUbicacion valor={destino} repartidor={punto} altura={altura} />
      <p
        aria-live="polite"
        className={cn(
          'flex items-start gap-2 text-xs',
          posicion && !vieja ? 'text-tinta-suave' : 'text-tinta-tenue',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'mt-1 size-2 shrink-0 rounded-full',
            posicion && !vieja ? 'animate-brillo bg-info' : 'bg-tinta-tenue/50',
          )}
        />
        <span>{explicar(seguimiento, distancia, vieja, para)}</span>
      </p>
    </div>
  );
}

/** Lo que dice la línea de abajo del mapa, según lo que se sabe. */
function explicar(
  seguimiento: SeguimientoPedido | null,
  distancia: string | null,
  vieja: boolean,
  para: 'cliente' | 'personal',
): string {
  if (!seguimiento) return 'Buscando al repartidor…';
  if (!seguimiento.enCamino) return 'El pedido ya no está en camino.';

  const quien = seguimiento.repartidor ?? 'El repartidor';
  const posicion = seguimiento.posicion;

  if (!posicion) {
    return para === 'cliente'
      ? `${quien} salió con su pedido. Su ubicación aparece aquí apenas su teléfono la comparta.`
      : `En camino, pero ${quien} todavía no compartió su ubicación.`;
  }

  const cuando = formatearAntiguedad(posicion.antiguedadSegundos);
  if (vieja) {
    return `Última ubicación de ${quien}: ${cuando}. Su teléfono pudo perder la señal; se actualiza sola en cuanto vuelva.`;
  }

  const donde = distancia ? ` · a ${distancia} en línea recta` : '';
  return para === 'cliente'
    ? `${quien} viene en camino${donde} · ${cuando}`
    : `${quien} va en camino${donde} del destino · ${cuando}`;
}
