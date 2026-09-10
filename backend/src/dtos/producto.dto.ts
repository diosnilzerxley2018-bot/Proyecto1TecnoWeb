import { z } from 'zod';
import type { ExistenciaDTO, ValorNutricionalDTO } from './comun.dto.js';
import { TIPOS_CONSERVACION, type TipoConservacion } from '../config/dominio.js';

/** CU-PRO-01 — Gestionar Producto y Receta (parte de producto). */

/** NUMERIC(10,2) en el esquema. */
const precio = z
  .number()
  .min(0, 'el precio de venta no puede ser negativo')
  .max(99999999.99, 'el precio de venta excede el máximo admitido');

export const esquemaCrearProducto = z.object({
  nombre: z.string().trim().min(2).max(100),
  descripcion: z.string().trim().max(250).nullable().optional(),
  precioVenta: precio,
  idCategoria: z.number().int().positive(),
  /** CU-INV-02: decide en qué almacén puede guardarse el producto terminado. */
  tipoConservacion: z.enum(TIPOS_CONSERVACION).default('Seco'),
});

export const esquemaActualizarProducto = esquemaCrearProducto
  .partial()
  .extend({ activo: z.boolean().optional() });

export const esquemaFiltroProductos = z.object({
  termino: z.string().trim().min(1).max(100).optional(),
  categoria: z.coerce.number().int().positive().optional(),
  incluirInactivos: z
    .enum(['true', 'false'])
    .optional()
    .transform((valor) => valor === 'true'),
});

/**
 * CU-PRO-03 — Registrar Valor Nutricional, extensión de CU-PRO-01.
 * NUMERIC(6,2) para los macronutrientes; las calorías son enteras.
 */
const gramos = (etiqueta: string) =>
  z.number().min(0, `${etiqueta} no puede ser negativo`).max(9999.99);

export const esquemaValorNutricional = z.object({
  calorias: z.number().int().min(0, 'las calorías no pueden ser negativas').max(100000),
  proteinas: gramos('las proteínas'),
  carbohidratos: gramos('los carbohidratos'),
  grasas: gramos('las grasas'),
  fibra: gramos('la fibra').nullable().optional(),
});

export type DatosCrearProducto = z.infer<typeof esquemaCrearProducto>;
export type DatosActualizarProducto = z.infer<typeof esquemaActualizarProducto>;
export type FiltroProductosDTO = z.infer<typeof esquemaFiltroProductos>;
export type DatosValorNutricional = z.infer<typeof esquemaValorNutricional>;

export interface ProductoGestionDTO {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  activo: boolean;
  tipoConservacion: TipoConservacion;
  categoria: { id: number; nombre: string };
  valorNutricional: ValorNutricionalDTO | null;
  stockTotal: number;
  existencias: ExistenciaDTO[];
  /**
   * Costo unitario promedio, deducido de las notas de ingreso.
   * Nulo cuando el producto todavía no tuvo ningún ingreso registrado.
   */
  costoPromedio: number | null;
  /**
   * Verdadero cuando el precio de venta no cubre el costo.
   *
   * No lo impide —una promoción a pérdida es una decisión legítima— pero lo
   * dice, que es lo que un error de tipeo necesita para no pasar inadvertido.
   */
  vendeBajoCosto: boolean;
}
