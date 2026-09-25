import { z } from 'zod';
import { cantidadDeInsumo } from './cantidad.dto.js';

/** CU-PRO-01 — Gestionar Producto y Receta (parte de receta). */

const esquemaLinea = z.object({
  idIngrediente: z.number().int().positive(),
  cantidadRequerida: cantidadDeInsumo('la cantidad requerida'),
});

const cabecera = {
  nombre: z.string().trim().min(2).max(100),
  rendimiento: z.number().int().gt(0, 'el rendimiento debe ser mayor a cero').max(10000),
  tiempoPreparacionMinutos: z.number().int().min(0).max(10000),
  instrucciones: z.string().trim().max(500).nullable().optional(),
  /**
   * Una bebida escala de forma continua: para tres vasos se usa el triple de
   * insumo. Una bandeja de horno no: si rinde 4 y hacen falta 3, se hornean 4.
   * Por omisión se asume divisible, que es el caso más común en el mostrador.
   */
  divisible: z.boolean().optional(),
};

export const esquemaCrearReceta = z.object({
  ...cabecera,
  /**
   * RF-PRO-04: un producto admite varias versiones pero una sola activa.
   * Por omisión la versión nace inactiva, para no chocar con la vigente.
   */
  activa: z.boolean().optional().default(false),
  divisible: cabecera.divisible.default(true),
  insumos: z.array(esquemaLinea).min(1, 'la receta debe llevar al menos un insumo').max(50),
});

export const esquemaActualizarReceta = z.object({
  nombre: cabecera.nombre.optional(),
  rendimiento: cabecera.rendimiento.optional(),
  tiempoPreparacionMinutos: cabecera.tiempoPreparacionMinutos.optional(),
  instrucciones: cabecera.instrucciones,
  divisible: cabecera.divisible,
  insumos: z.array(esquemaLinea).min(1).max(50).optional(),
});

export type DatosCrearReceta = z.infer<typeof esquemaCrearReceta>;
export type DatosActualizarReceta = z.infer<typeof esquemaActualizarReceta>;

export interface LineaRecetaDTO {
  idIngrediente: number;
  nombre: string;
  unidad: string;
  cantidadRequerida: number;
  insumoActivo: boolean;
}

export interface RecetaDTO {
  id: number;
  nombre: string;
  producto: { id: number; nombre: string };
  rendimiento: number;
  tiempoPreparacionMinutos: number;
  instrucciones: string | null;
  activa: boolean;
  divisible: boolean;
  insumos: LineaRecetaDTO[];
}
