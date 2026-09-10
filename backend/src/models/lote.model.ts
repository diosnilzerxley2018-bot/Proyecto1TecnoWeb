import { prisma } from '../config/prisma.js';
import type { ClientePrisma } from './stock.model.js';

/**
 * Capa Model — clases de análisis tblLote y tblLoteAlmacen (hallazgo A6).
 *
 * `ingrediente_almacen` conserva la existencia consolidada, que es la que
 * consultan el control de stock y las alertas de reposición; estas tablas la
 * descomponen por lote para poder responder qué vence primero.
 */

const LOTE_CON_INSUMO = {
  id_lote: true,
  codigo: true,
  fecha_vencimiento: true,
  id_ingrediente: true,
  ingrediente: {
    select: {
      nombre: true,
      controla_vencimiento: true,
      unidad_medida: { select: { abreviatura: true } },
    },
  },
} as const;

/**
 * Reutiliza el lote cuando coinciden insumo, código y vencimiento.
 *
 * Dos entradas del mismo lote de proveedor son el mismo lote físico: crear uno
 * nuevo por cada nota fragmentaría el inventario sin motivo.
 */
export async function obtenerOCrear(
  tx: ClientePrisma,
  datos: { idIngrediente: number; codigo: string | null; fechaVencimiento: Date },
): Promise<number> {
  const existente = await tx.lote.findFirst({
    where: {
      id_ingrediente: datos.idIngrediente,
      codigo: datos.codigo,
      fecha_vencimiento: datos.fechaVencimiento,
    },
    select: { id_lote: true },
  });
  if (existente) return existente.id_lote;

  const creado = await tx.lote.create({
    data: {
      id_ingrediente: datos.idIngrediente,
      codigo: datos.codigo,
      fecha_vencimiento: datos.fechaVencimiento,
    },
    select: { id_lote: true },
  });
  return creado.id_lote;
}

export const incrementar = (
  tx: ClientePrisma,
  idLote: number,
  idAlmacen: number,
  cantidad: number,
) =>
  tx.lote_almacen.upsert({
    where: { id_lote_id_almacen: { id_lote: idLote, id_almacen: idAlmacen } },
    update: { stock_actual: { increment: cantidad } },
    create: { id_lote: idLote, id_almacen: idAlmacen, stock_actual: cantidad },
  });

/**
 * Lotes de un insumo en un almacén, del que vence antes al que vence después.
 *
 * Es el orden que impone el consumo FEFO —*first expired, first out*—: en un
 * negocio de comida fresca debe salir primero lo que caduca antes, no lo que
 * más abunda.
 */
export const disponiblesPorVencimiento = (
  tx: ClientePrisma,
  idIngrediente: number,
  idAlmacen: number,
) =>
  tx.lote_almacen.findMany({
    where: {
      id_almacen: idAlmacen,
      stock_actual: { gt: 0 },
      lote: { id_ingrediente: idIngrediente },
    },
    select: {
      id_lote: true,
      stock_actual: true,
      lote: { select: { fecha_vencimiento: true, codigo: true } },
    },
    orderBy: { lote: { fecha_vencimiento: 'asc' } },
  });

/** Descuento atómico: la condición de suficiencia viaja dentro del UPDATE. */
export async function descontar(
  tx: ClientePrisma,
  idLote: number,
  idAlmacen: number,
  cantidad: number,
): Promise<boolean> {
  const { count } = await tx.lote_almacen.updateMany({
    where: { id_lote: idLote, id_almacen: idAlmacen, stock_actual: { gte: cantidad } },
    data: { stock_actual: { decrement: cantidad } },
  });
  return count === 1;
}

/** Lotes con existencias, ordenados por proximidad de vencimiento. */
export const vigentes = (hasta?: Date) =>
  prisma.lote_almacen.findMany({
    where: {
      stock_actual: { gt: 0 },
      ...(hasta ? { lote: { fecha_vencimiento: { lte: hasta } } } : {}),
    },
    select: {
      stock_actual: true,
      almacen: { select: { id_almacen: true, nombre: true } },
      lote: { select: LOTE_CON_INSUMO },
    },
    orderBy: { lote: { fecha_vencimiento: 'asc' } },
  });

export type LoteConExistencia = Awaited<ReturnType<typeof vigentes>>[number];
