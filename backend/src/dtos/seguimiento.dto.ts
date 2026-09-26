import { z } from 'zod';
import { coordenada } from './ubicacion.dto.js';

/**
 * Seguimiento del repartidor en vivo.
 *
 * El teléfono del repartidor envía su posición mientras lleva un pedido, y
 * quien espera ese pedido la ve en el mapa.
 */

/** Lo que envía el teléfono. Las coordenadas, con los seis decimales del esquema. */
export const esquemaPosicion = z.object({
  latitud: coordenada(90),
  longitud: coordenada(180),
  /** Radio de incertidumbre que informa el GPS, en metros. */
  precision: z
    .number()
    .min(0)
    .max(1_000_000)
    .transform((v) => Math.round(v * 10) / 10)
    .nullable()
    .optional(),
});

export type DatosPosicion = z.infer<typeof esquemaPosicion>;

export interface PosicionDTO {
  latitud: number;
  longitud: number;
  /** Radio de incertidumbre en metros, según el teléfono. */
  precision: number | null;
  actualizadaEn: string;
  /**
   * Segundos desde el último envío, medidos por el servidor: el reloj del
   * teléfono de quien mira puede estar corrido, y «hace 20 s» tiene que ser
   * verdad.
   */
  antiguedadSegundos: number;
}

export interface SeguimientoDTO {
  /** El pedido está en camino: hay algo que seguir. */
  enCamino: boolean;
  /** Nombre de pila de quien lo lleva. */
  repartidor: string | null;
  /** Última posición conocida; `null` si todavía no compartió ninguna. */
  posicion: PosicionDTO | null;
}
