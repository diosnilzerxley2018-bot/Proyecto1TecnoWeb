import type { EstadoPedido, MetodoPago, MotivoCancelacion } from '@/types';
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

/* ------------------------------------------------------------------ */
/* Cómo se dice el pago y la cancelación                               */
/* ------------------------------------------------------------------ */

interface PedidoConPago {
  estadoPedido: EstadoPedido;
  estadoPago: string;
  metodoPago: MetodoPago;
  total: number;
  motivoCancelacion?: MotivoCancelacion | null;
}

const bs = (monto: number) =>
  `Bs ${monto.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * El estado del pago en palabras, según quién lo lee.
 *
 * Antes se armaba "Pago {estado} · {método}", y salían frases como "Pago
 * pendiente · Efectivo" en amarillo de advertencia —que el cliente leía como
 * "algo falló con mi pago" cuando simplemente paga al recibir— o "Pago pagado".
 * Al cliente se le dice qué tiene que hacer; al personal, qué tiene que cobrar.
 */
export function textoDePago(
  pedido: PedidoConPago,
  para: 'cliente' | 'personal',
): { texto: string; tono: Tono } {
  const pagado = pedido.estadoPago === 'Pagado';
  const efectivo = pedido.metodoPago === 'Efectivo';
  const medio = pedido.metodoPago === 'QR' ? 'QR' : 'tarjeta';

  if (pedido.estadoPedido === 'Cancelado') {
    if (pagado) {
      return para === 'cliente'
        ? { texto: 'Pagado en línea · el reembolso se gestiona aparte', tono: 'neutro' }
        : { texto: 'Pagado en línea · reembolsar', tono: 'aviso' };
    }
    return { texto: 'Sin cobro', tono: 'neutro' };
  }

  if (efectivo) {
    if (pagado) {
      return { texto: para === 'cliente' ? 'Pagado en efectivo' : 'Cobrado en efectivo', tono: 'marca' };
    }
    return para === 'cliente'
      ? { texto: `Paga ${bs(pedido.total)} en efectivo al recibir`, tono: 'neutro' }
      : { texto: `Cobrar ${bs(pedido.total)} en efectivo`, tono: 'aviso' };
  }

  if (pagado) {
    return {
      texto: para === 'cliente' ? `Pagado con ${medio}` : `Pagado con ${medio} · no cobrar`,
      tono: 'marca',
    };
  }
  if (pedido.estadoPago === 'Vencido') return { texto: 'Venció el plazo de pago', tono: 'peligro' };
  return {
    texto: para === 'cliente' ? `Esperando su pago con ${medio}` : `Esperando pago con ${medio}`,
    tono: 'aviso',
  };
}

/**
 * Por qué se canceló, en palabras de quien lo lee.
 *
 * Los tres caminos terminan en el mismo estado, pero al cliente no le dicen lo
 * mismo: antes veía "Pedido cancelado" cuando el repartidor no pudo
 * entregárselo, como si lo hubiera anulado él, y además le hablaban de "stock
 * repuesto al inventario", que es asunto del local.
 */
export function explicarCancelacion(
  pedido: PedidoConPago,
  para: 'cliente' | 'personal',
): { titulo: string; detalle: string } {
  const pagado = pedido.estadoPago === 'Pagado';
  const cobro =
    para === 'personal'
      ? 'Lo reservado volvió al inventario.'
      : pagado
        ? 'Como lo pagó en línea, el reembolso se gestiona aparte.'
        : 'No se le cobró nada.';

  switch (pedido.motivoCancelacion) {
    case 'Cliente':
      return {
        titulo: para === 'cliente' ? 'Usted canceló este pedido' : 'Cancelado por el cliente',
        detalle: cobro,
      };
    case 'No entregado':
      return {
        titulo: para === 'cliente' ? 'No pudimos entregar este pedido' : 'No se pudo entregar',
        detalle:
          para === 'cliente'
            ? `El repartidor fue a su dirección y no pudo entregarlo. ${cobro}`
            : `El repartidor lo registró como no entregado. ${cobro}`,
      };
    case 'Sin pago':
      return {
        titulo: para === 'cliente' ? 'El pago no se completó' : 'Cancelado por falta de pago',
        detalle:
          para === 'cliente'
            ? 'El pago en línea no se llegó a completar, así que el pedido se canceló. No se le cobró nada.'
            : `El cobro en línea no se completó: venció, lo rechazó la pasarela o se anuló. ${cobro}`,
      };
    default:
      return { titulo: 'Pedido cancelado', detalle: cobro };
  }
}

/**
 * El aviso que confirma cada acción del personal.
 *
 * Antes la pantalla del repartidor tenía un solo mensaje para todo lo que no
 * fuera "Entregado", y al marcar un pedido **en camino** le decía "Registrado
 * como no entregado. La comida vuelve al inventario".
 */
export function avisoTrasAccion(numero: number, destino: EstadoPedido, pedido: PedidoConPago): string {
  const n = `#${String(numero).padStart(5, '0')}`;
  switch (destino) {
    case 'En preparacion':
      return `Pedido ${n} en preparación`;
    case 'En camino':
      return pedido.metodoPago === 'Efectivo' && pedido.estadoPago !== 'Pagado'
        ? `Pedido ${n} en camino. Recuerde cobrar ${bs(pedido.total)} en efectivo`
        : `Pedido ${n} en camino`;
    case 'Entregado':
      return pedido.metodoPago === 'Efectivo'
        ? `Pedido ${n} entregado y cobrado: ${bs(pedido.total)} en efectivo`
        : `Pedido ${n} entregado`;
    case 'Cancelado':
      return `Pedido ${n} registrado como no entregado. Se le avisó al cliente`;
    default:
      return `Pedido ${n} actualizado`;
  }
}
