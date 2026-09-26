import { prisma } from '../config/prisma.js';
import * as insumoModel from './insumo.model.js';
import * as productoModel from './producto.model.js';

/**
 * Capa Model — consulta de existencias para CU-INV-05 Control de Stock.
 *
 * Cada ítem llega con sus existencias en **todos** los almacenes, aunque se
 * consulte uno solo: el servicio separa lo del almacén pedido, pero la
 * reposición se decide contra la existencia de todo el negocio. Son pocos
 * almacenes, así que traerlos todos no cuesta y evita una segunda consulta
 * solo para los totales.
 */

export interface FiltroStock {
  idAlmacen?: number;
  termino?: string;
}

export const existenciasDeInsumos = async (filtro: FiltroStock) =>
  prisma.ingrediente.findMany({
    where: { activo: true, ...(await insumoModel.porTexto(filtro.termino)) },
    select: {
      id_ingrediente: true,
      nombre: true,
      stock_minimo: true,
      unidad_medida: { select: { abreviatura: true } },
      ingrediente_almacen: {
        select: { stock_actual: true, almacen: { select: { id_almacen: true, nombre: true } } },
      },
    },
    orderBy: { nombre: 'asc' },
  });

export const existenciasDeProductos = async (filtro: FiltroStock) =>
  prisma.producto.findMany({
    where: { activo: true, ...(await productoModel.porTexto(filtro.termino)) },
    select: {
      id_producto: true,
      nombre: true,
      producto_almacen: {
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
