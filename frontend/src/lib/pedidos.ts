import type { EstadoPedido } from '@/types';
import type { Tono } from '@/components/ui/Insignia';

/**
 * Presentación del ciclo de vida del pedido.
 *
 * Es el espejo en la interfaz de la máquina de estados que gobierna el
 * servidor (RF-PED-08): el mismo orden y los mismos nombres. La interfaz nunca
 * decide qué transición es válida —eso lo dice `transicionesPosibles` que
 * devuelve la API—, aquí solo se resuelve cómo se ve cada estado.
 */

/**
 * `Pendiente de pago` no figura: no es un paso del reparto sino una antesala.
 * El pedido entra al flujo cuando el cobro se confirma.
 */
export const ORDEN_FLUJO: EstadoPedido[] = [
  'Recibido',
  'En preparacion',
  'En camino',
  'Entregado',
];

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  'Pendiente de pago': 'Esperando pago',
  Recibido: 'Recibido',
  'En preparacion': 'En preparación',
  'En camino': 'En camino',
  Entregado: 'Entregado',
  Cancelado: 'Cancelado',
};

export const TONO_ESTADO: Record<EstadoPedido, Tono> = {
  'Pendiente de pago': 'aviso',
  Recibido: 'info',
  'En preparacion': 'aviso',
  'En camino': 'violeta',
  Entregado: 'marca',
  Cancelado: 'peligro',
};

/** Verbo de la acción que lleva al estado indicado. */
export const ACCION_HACIA: Record<string, string> = {
  'En preparacion': 'Poner en preparación',
  'En camino': 'Marcar en camino',
  Entregado: 'Registrar entrega',
  Cancelado: 'No se pudo entregar',
};

/**
 * Separa las transiciones que devuelve el servidor en las dos cosas distintas
 * que son: seguir el flujo, o salirse de él.
 *
 * Un pedido en camino admite las dos —se entrega, o no había nadie y vuelve— y
 * no pueden dibujarse igual: una es la acción esperada y la otra el desenlace
 * que se registra cuando algo salió mal. Quién puede hacerlas lo decide el
 * servidor; esto solo resuelve cómo se ven.
 */
export function separarTransiciones(posibles: EstadoPedido[]): {
  avance: EstadoPedido | null;
  salidas: EstadoPedido[];
} {
  return {
    avance: posibles.find((estado) => ORDEN_FLUJO.includes(estado)) ?? null,
    salidas: posibles.filter((estado) => !ORDEN_FLUJO.includes(estado)),
  };
}

export { formatearBs, formatearFecha, tiempoTranscurrido } from './formato';
