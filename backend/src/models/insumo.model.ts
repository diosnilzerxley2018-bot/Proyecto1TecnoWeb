import { prisma } from '../config/prisma.js';
import type { ClientePrisma } from './stock.model.js';

/**
 * Capa Model — clases de análisis tblIngrediente y tblUnidadMedida.
 *
 * Las escrituras devuelven solo el identificador y el servicio vuelve a leer:
 * un `select` con relaciones dentro de un `create` o un `update` hace que
 * Prisma las cargue en paralelo sobre el cliente fijado por su transacción
 * implícita, algo que `pg` marca como obsoleto.
 */

const CAMPOS = {
  id_ingrediente: true,
  nombre: true,
  stock_minimo: true,
  costo_unitario: true,
  activo: true,
  tipo_conservacion: true,
  controla_vencimiento: true,
  unidad_medida: { select: { id_unidad: true, nombre: true, abreviatura: true } },
  ingrediente_almacen: {
    select: {
      stock_actual: true,
      almacen: { select: { id_almacen: true, nombre: true } },
    },
  },
} as const;

export interface FiltroInsumos {
  termino?: string;
  soloActivos?: boolean;
}

export const listar = (filtro: FiltroInsumos) =>
  prisma.ingrediente.findMany({
    where: {
      ...(filtro.soloActivos ? { activo: true } : {}),
      ...(filtro.termino ? { nombre: { contains: filtro.termino, mode: 'insensitive' } } : {}),
    },
    select: CAMPOS,
    orderBy: { nombre: 'asc' },
  });

export const buscarPorId = (id: number) =>
  prisma.ingrediente.findUnique({ where: { id_ingrediente: id }, select: CAMPOS });

export const crear = (datos: {
  nombre: string;
  idUnidad: number;
  costoUnitario: number;
  stockMinimo: number;
  tipoConservacion: string;
  controlaVencimiento: boolean;
}) =>
  prisma.ingrediente.create({
    data: {
      nombre: datos.nombre,
      id_unidad: datos.idUnidad,
      costo_unitario: datos.costoUnitario,
      stock_minimo: datos.stockMinimo,
      tipo_conservacion: datos.tipoConservacion,
      controla_vencimiento: datos.controlaVencimiento,
    },
    select: { id_ingrediente: true },
  });

export const actualizar = (
  id: number,
  datos: {
    nombre?: string;
    idUnidad?: number;
    costoUnitario?: number;
    stockMinimo?: number;
    activo?: boolean;
    tipoConservacion?: string;
    controlaVencimiento?: boolean;
  },
) =>
  prisma.ingrediente.update({
    where: { id_ingrediente: id },
    data: {
      ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
      ...(datos.idUnidad !== undefined ? { id_unidad: datos.idUnidad } : {}),
      ...(datos.costoUnitario !== undefined ? { costo_unitario: datos.costoUnitario } : {}),
      ...(datos.stockMinimo !== undefined ? { stock_minimo: datos.stockMinimo } : {}),
      ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
      ...(datos.tipoConservacion !== undefined
        ? { tipo_conservacion: datos.tipoConservacion }
        : {}),
      ...(datos.controlaVencimiento !== undefined
        ? { controla_vencimiento: datos.controlaVencimiento }
        : {}),
    },
    select: { id_ingrediente: true },
  });

export const eliminar = (id: number) =>
  prisma.ingrediente.delete({ where: { id_ingrediente: id } });

/** CU-INV-01: no se puede cambiar la unidad de un insumo que ya registra existencias. */
export const contarExistencias = (id: number) =>
  prisma.ingrediente_almacen.count({
    where: { id_ingrediente: id, stock_actual: { gt: 0 } },
  });

export const contarUsoEnRecetas = (id: number) =>
  prisma.detalle_receta.count({ where: { id_ingrediente: id } });

/** Movimientos históricos: notas de ingreso y de egreso que tocaron el insumo. */
export async function contarMovimientos(id: number): Promise<number> {
  const [ingresos, egresos] = await Promise.all([
    prisma.detalle_ingreso_insumo.count({ where: { id_ingrediente: id } }),
    prisma.detalle_egreso_insumo.count({ where: { id_ingrediente: id } }),
  ]);
  return ingresos + egresos;
}

export const listarUnidades = () =>
  prisma.unidad_medida.findMany({
    select: { id_unidad: true, nombre: true, abreviatura: true },
    orderBy: { nombre: 'asc' },
  });

export const buscarUnidad = (id: number) =>
  prisma.unidad_medida.findUnique({ where: { id_unidad: id }, select: { id_unidad: true } });

export type InsumoConsultado = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;

/** Insumos existentes entre los indicados; `soloActivos` filtra las bajas lógicas. */
export const existentes = (ids: number[], tx: ClientePrisma, soloActivos: boolean) =>
  tx.ingrediente.findMany({
    where: { id_ingrediente: { in: ids }, ...(soloActivos ? { activo: true } : {}) },
    select: {
      id_ingrediente: true,
      nombre: true,
      tipo_conservacion: true,
      controla_vencimiento: true,
    },
  });
