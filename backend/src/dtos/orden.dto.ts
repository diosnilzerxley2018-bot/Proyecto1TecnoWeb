import { z } from 'zod';
import { camposDeFecha, camposDePagina } from './paginacion.dto.js';
import { ESTADOS_ORDEN, type EstadoOrden, type TipoConservacion } from '../config/dominio.js';

/** CU-PRO-02 — Gestionar Orden de Producción, y CU-PRO-04 — Cancelar Orden. */

export const esquemaCrearOrden = z.object({
  idReceta: z.number().int().positive(),
  /** Porciones a producir. El esquema declara la columna como entera. */
  cantidad: z.number().int().gt(0, 'la cantidad a producir debe ser mayor a cero').max(100000),
});

/**
 * El almacén de destino del producto terminado es opcional: si se omite, el
 * sistema lo deduce de la condición de conservación del producto. Solo hace
 * falta indicarlo cuando hay más de un almacén compatible.
 */
export const esquemaFinalizarOrden = z.object({
  idAlmacenDestino: z.number().int().positive().optional(),
  /**
   * Hallazgo H10 — lo que salió de verdad del horno.
   *
   * Si se omite, se asume que salió lo planificado, que es el caso corriente y
   * el que no debe estorbar. Cero es válido: un lote entero puede perderse, y
   * los insumos se consumieron igual.
   */
  cantidadObtenida: z.number().int().min(0).max(100000).optional(),
});

export const esquemaFiltroOrdenes = z.object({
  estado: z.enum(ESTADOS_ORDEN).optional(),
  ...camposDeFecha,
  ...camposDePagina,
});

export type DatosCrearOrden = z.infer<typeof esquemaCrearOrden>;
export type DatosFinalizarOrden = z.infer<typeof esquemaFinalizarOrden>;

export interface InsumoRequeridoDTO {
  idIngrediente: number;
  nombre: string;
  unidad: string;
  cantidadRequerida: number;
  costoUnitario: number;
}

export interface OrdenProduccionDTO {
  id: number;
  fecha: string;
  estado: EstadoOrden;
  cantidad: number;
  fechaFinalizacion: string | null;
  transicionesPosibles: EstadoOrden[];
  cancelable: boolean;
  receta: { id: number; nombre: string; rendimiento: number };
  producto: { id: number; nombre: string; tipoConservacion: TipoConservacion };
  registradoPor: { id: number; nombreCompleto: string };
  /**
   * Los insumos de la corrida.
   *
   * Mientras la orden no se finaliza son una **previsión**, calculada desde la
   * receta vigente. Una vez finalizada son el **hecho**: lo que registró la
   * nota de egreso. Editar la receta después no reescribe el historial
   * (hallazgo H6).
   */
  insumosRequeridos: InsumoRequeridoDTO[];
  /** Previsión antes de ejecutar; el costo real de la corrida después. */
  costoEstimado: number;
  /** Cuántas salieron de verdad. Nulo mientras la orden no se finaliza (H10). */
  cantidadObtenida: number | null;
  /** Planificado menos obtenido, cuando salió de menos. Nulo antes de finalizar. */
  merma: number | null;
  /**
   * Costo de la corrida repartido entre lo **obtenido**, no entre lo
   * planificado: si se perdieron tres unidades, las que quedaron cargan con su
   * costo, que es lo que lo hace un dato de costos y no un adorno.
   */
  costoUnitario: number | null;
  /** A qué almacén fue el producto terminado (hallazgo H4). */
  almacenDestino: { id: number; nombre: string } | null;
  notas: { egreso: number | null; ingreso: number | null };
}
