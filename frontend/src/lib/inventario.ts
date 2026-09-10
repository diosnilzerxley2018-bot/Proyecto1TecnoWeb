import type { MotivoEgreso, MotivoIngreso } from '@/types';
import type { Tono } from '@/components/ui/Insignia';

/**
 * Vocabulario de los movimientos de inventario.
 *
 * Las dos listas de motivos no coinciden, y la diferencia es deliberada: no
 * existe el motivo "Venta" ni "Pedido" porque esas salidas ya quedan
 * documentadas por el detalle de la venta o del pedido, que registra el
 * almacén de origen. La nota de egreso documenta lo que no tiene otro respaldo.
 */

export const MOTIVOS_INGRESO: MotivoIngreso[] = ['Compra', 'Produccion', 'Ajuste', 'Devolucion'];
export const MOTIVOS_EGRESO: MotivoEgreso[] = ['Produccion', 'Merma', 'Ajuste'];

export const ETIQUETA_MOTIVO: Record<string, string> = {
  Compra: 'Compra',
  Produccion: 'Producción',
  Ajuste: 'Ajuste',
  Devolucion: 'Devolución',
  Merma: 'Merma',
};

export const TONO_MOTIVO: Record<string, Tono> = {
  Compra: 'marca',
  Produccion: 'violeta',
  Ajuste: 'info',
  Devolucion: 'aviso',
  Merma: 'peligro',
};

/** Descripción de qué significa cada motivo, para el formulario de registro. */
export const AYUDA_MOTIVO: Record<string, string> = {
  Compra: 'Mercadería recibida de un proveedor',
  Produccion: 'Generado por una orden de producción',
  Ajuste: 'Corrección de inventario tras un recuento',
  Devolucion: 'Retorno de mercadería previamente entregada',
  Merma: 'Pérdida por deterioro, rotura o vencimiento',
};
