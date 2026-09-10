import { z } from 'zod';
import { ESTADOS_PAGO, MODOS_COBRO } from '../config/dominio.js';

/** RF-PED-04 — cobros y modo de cobro del sistema. */

export const esquemaFiltroPagos = z.object({
  estado: z.enum(ESTADOS_PAGO).optional(),
  modo: z.enum(MODOS_COBRO).optional(),
});

/**
 * Cambio del modo de cobro.
 *
 * El cuerpo lleva un solo campo a propósito: activar el dinero real es una
 * decisión, no un ajuste que se arrastre dentro de una actualización de perfil.
 */
export const esquemaCambiarModo = z.object({
  modo: z.enum(MODOS_COBRO),
});

export type DatosFiltroPagos = z.infer<typeof esquemaFiltroPagos>;
export type DatosCambiarModo = z.infer<typeof esquemaCambiarModo>;
