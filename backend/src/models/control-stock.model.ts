import { prisma } from '../config/prisma.js';

/**
 * Capa Model — consulta de existencias para CU-INV-05 Control de Stock.
 *
 * El filtro por almacén se aplica dentro de la relación y no en memoria, de
 * modo que la base devuelve solo las filas pedidas. Un ítem sin existencias en
 * el almacén consultado llega con la lista vacía: el caso de uso pide
 * presentarlo con stock cero, no ocultarlo.
 */

export interface FiltroStock {
  idAlmacen?: number;
  termino?: string;
}

const porNombre = (termino?: string) =>
  termino ? { nombre: { contains: termino, mode: 'insensitive' as const } } : {};

const porAlmacen = (idAlmacen?: number) => (idAlmacen ? { id_almacen: idAlmacen } : {});

export const existenciasDeInsumos = (filtro: FiltroStock) =>
  prisma.ingrediente.findMany({
    where: { activo: true, ...porNombre(filtro.termino) },
    select: {
      id_ingrediente: true,
      nombre: true,
      stock_minimo: true,
      unidad_medida: { select: { abreviatura: true } },
      ingrediente_almacen: {
        where: porAlmacen(filtro.idAlmacen),
        select: { stock_actual: true, almacen: { select: { id_almacen: true, nombre: true } } },
      },
    },
    orderBy: { nombre: 'asc' },
  });

export const existenciasDeProductos = (filtro: FiltroStock) =>
  prisma.producto.findMany({
    where: { activo: true, ...porNombre(filtro.termino) },
    select: {
      id_producto: true,
      nombre: true,
      producto_almacen: {
        where: porAlmacen(filtro.idAlmacen),
        select: { stock_actual: true, almacen: { select: { id_almacen: true, nombre: true } } },
      },
    },
    orderBy: { nombre: 'asc' },
  });

/**
 * Insumos activos con su existencia consolidada, para calcular las alertas.
 *
 * Se consultan todos y no solo los que tienen filas de stock: CU-INV-05 indica
 * que un insumo sin existencias en ningún almacén se presenta con stock cero y
 * se incluye en las alertas.
 */
export const insumosConExistencias = (idsInsumo?: number[]) =>
  prisma.ingrediente.findMany({
    where: { activo: true, ...(idsInsumo ? { id_ingrediente: { in: idsInsumo } } : {}) },
    select: {
      id_ingrediente: true,
      nombre: true,
      stock_minimo: true,
      unidad_medida: { select: { abreviatura: true } },
      ingrediente_almacen: { select: { stock_actual: true } },
    },
    orderBy: { nombre: 'asc' },
  });

export type InsumoConExistencias = Awaited<ReturnType<typeof insumosConExistencias>>[number];
