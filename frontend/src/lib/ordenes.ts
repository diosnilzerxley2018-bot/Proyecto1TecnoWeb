import type { EstadoOrden } from '@/types';
import type { Tono } from '@/components/ui/Insignia';

/**
 * Ciclo de vida de la orden de producción.
 *
 * CU-PRO-02: "El estado de la orden evoluciona según el flujo: Pendiente, En
 * proceso y Finalizada." La cancelación queda fuera de la secuencia porque es
 * otro caso de uso —CU-PRO-04, que extiende a este— con su propia condición.
 */
export const FLUJO_ORDEN: EstadoOrden[] = ['Pendiente', 'En proceso', 'Finalizada'];

export const TONO_ORDEN: Record<EstadoOrden, Tono> = {
  Pendiente: 'info',
  'En proceso': 'aviso',
  Finalizada: 'marca',
  Cancelada: 'peligro',
};

/** Verbo de la acción que lleva al estado indicado. */
export const ACCION_ORDEN: Record<string, string> = {
  'En proceso': 'Iniciar producción',
  Finalizada: 'Registrar finalización',
};

/**
 * Qué ocurre al ejecutar cada transición.
 *
 * Finalizar no es un cambio de estado más: RF-PRO-07 exige que genere la nota
 * de egreso por los insumos consumidos y la de ingreso por el producto
 * obtenido, en una sola transacción. Conviene decirlo antes de pulsar.
 */
export const CONSECUENCIA_ORDEN: Record<string, string> = {
  'En proceso': 'La orden pasa a elaborarse. Los insumos todavía no se consumen.',
  Finalizada:
    'Se descuentan los insumos, ingresa el producto terminado y se generan ambas notas en una sola transacción.',
};
