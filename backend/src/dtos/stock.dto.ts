import { z } from 'zod';
import type { ExistenciaDTO } from './comun.dto.js';

/** CU-INV-05 — Control de Stock. */

export const esquemaFiltroStock = z.object({
  almacen: z.coerce.number().int().positive().optional(),
  termino: z.string().trim().min(1).max(100).optional(),
  tipo: z.enum(['insumo', 'producto']).optional(),
});

export type FiltroStockDTO = {
  idAlmacen?: number;
  termino?: string;
  tipo?: 'insumo' | 'producto';
};

export interface ExistenciaStockDTO {
  tipo: 'insumo' | 'producto';
  id: number;
  nombre: string;
  unidad: string;
  /** Lo que hay en el almacén consultado; sin filtro, en todos. */
  stockTotal: number;
  /**
   * Lo que hay sumando todos los almacenes. Con filtro por almacén difiere de
   * `stockTotal`, y es contra esta cifra que se decide la reposición.
   */
  stockGeneral: number;
  /** Solo los insumos declaran stock mínimo en el esquema. */
  stockMinimo: number | null;
  /** La existencia de todo el negocio alcanzó el mínimo: el filtro no la cambia. */
  bajoMinimo: boolean;
  /** Solo las del almacén consultado; sin filtro, todas. */
  existencias: ExistenciaDTO[];
}

export interface AlertaStockDTO {
  id: number;
  nombre: string;
  unidad: string;
  stockTotal: number;
  stockMinimo: number;
}

/** Lote con existencias y su proximidad de vencimiento (hallazgo A6). */
export interface LoteVigenteDTO {
  idLote: number;
  codigo: string | null;
  insumo: string;
  unidad: string;
  idAlmacen: number;
  almacen: string;
  stock: number;
  fechaVencimiento: string;
  /** Días que faltan; negativo si el lote ya está vencido. */
  diasParaVencer: number;
  vencido: boolean;
}
