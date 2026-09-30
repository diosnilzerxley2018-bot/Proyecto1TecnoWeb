import { z } from 'zod';
import { cantidadDeInsumoOCero } from './cantidad.dto.js';
import type { ExistenciaDTO } from './comun.dto.js';
import { TIPOS_CONSERVACION, type TipoConservacion } from '../config/dominio.js';

/** CU-INV-01 — Gestionar Insumo. */

/*
 * El costo no se escribe al dar de alta ni al editar: un insumo nace sin
 * costo y lo fija su primera compra, que es lo que se pagó
 * (`costeo.service`). Pedirlo antes era inventar un precio que ninguna
 * compra respaldaba y que después la primera compra pisaba.
 */
export const esquemaCrearInsumo = z.object({
  nombre: z.string().trim().min(2).max(100),
  idUnidad: z.number().int().positive(),
  stockMinimo: cantidadDeInsumoOCero('el stock mínimo'),
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
