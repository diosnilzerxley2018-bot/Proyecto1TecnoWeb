import { z } from 'zod';
import type { ExistenciaDTO } from './comun.dto.js';
import { TIPOS_CONSERVACION, type TipoConservacion } from '../config/dominio.js';

/** CU-INV-01 — Gestionar Insumo. */

/** NUMERIC(10,2) en el esquema: dos decimales y ocho enteros como máximo. */
const importe = (etiqueta: string) =>
  z
    .number()
    .min(0, `${etiqueta} no puede ser negativo`)
    .max(99999999.99, `${etiqueta} excede el máximo admitido`);

export const esquemaCrearInsumo = z.object({
  nombre: z.string().trim().min(2).max(100),
  idUnidad: z.number().int().positive(),
  costoUnitario: importe('el costo unitario'),
  stockMinimo: importe('el stock mínimo'),
  /**
   * CU-INV-02: el tipo de conservación decide en qué almacén puede guardarse.
   * Por omisión es Seco, la condición menos restrictiva.
   */
  tipoConservacion: z.enum(TIPOS_CONSERVACION).default('Seco'),
  /**
   * Solo los insumos perecederos exigen lote y vencimiento en cada ingreso.
   * Obligar a la harina o a la avena a llevarlo encarece la operación sin
   * aportar nada.
   */
  controlaVencimiento: z.boolean().default(false),
});

export const esquemaActualizarInsumo = esquemaCrearInsumo
  .partial()
  .extend({ activo: z.boolean().optional() });

/**
 * Filtro del listado.
 * `incluirInactivos` se lee de la cadena de consulta, donde todo llega como
 * texto: con `z.coerce.boolean()` la cadena "false" resultaría verdadera.
 */
export const esquemaFiltroInsumos = z.object({
  termino: z.string().trim().min(1).max(100).optional(),
  incluirInactivos: z
    .enum(['true', 'false'])
    .optional()
    .transform((valor) => valor === 'true'),
});

export type DatosCrearInsumo = z.infer<typeof esquemaCrearInsumo>;
export type DatosActualizarInsumo = z.infer<typeof esquemaActualizarInsumo>;
export type FiltroInsumosDTO = z.infer<typeof esquemaFiltroInsumos>;

export interface UnidadMedidaDTO {
  id: number;
  nombre: string;
  abreviatura: string;
}

export interface InsumoDTO {
  id: number;
  nombre: string;
  unidad: UnidadMedidaDTO;
  costoUnitario: number;
  stockMinimo: number;
  activo: boolean;
  tipoConservacion: TipoConservacion;
  controlaVencimiento: boolean;
  stockTotal: number;
  existencias: ExistenciaDTO[];
}
