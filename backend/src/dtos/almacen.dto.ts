import { z } from 'zod';
import { TIPOS_CONSERVACION, type TipoConservacion } from '../config/dominio.js';

/** CU-INV-02 — Gestionar Almacén. */

export const esquemaCrearAlmacen = z.object({
  nombre: z.string().trim().min(3).max(50),
  tipoConservacion: z.enum(TIPOS_CONSERVACION),
  ubicacionFisica: z.string().trim().max(150).nullable().optional(),
});

export const esquemaActualizarAlmacen = esquemaCrearAlmacen.partial().extend({
  /**
   * Destino por omisión de lo que se produce con esta conservación.
   *
   * Al haber un solo almacén por tipo, el sistema deduce el destino sin
   * preguntar. Con el segundo pierde esa capacidad y lo pide en cada
   * producción. Marcar uno como preferido devuelve la deducción, sin quitar la
   * posibilidad de elegir otro cuando el caso lo pida.
   */
  preferido: z.boolean().optional(),
});

export type DatosCrearAlmacen = z.infer<typeof esquemaCrearAlmacen>;
export type DatosActualizarAlmacen = z.infer<typeof esquemaActualizarAlmacen>;

export interface AlmacenDTO {
  id: number;
  nombre: string;
  tipoConservacion: TipoConservacion;
  ubicacionFisica: string | null;
  preferido: boolean;
}
