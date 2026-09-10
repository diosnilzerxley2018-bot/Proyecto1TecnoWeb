import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

/** Capa Model — clases de análisis tblReceta y tblDetalleReceta. */

type ClientePrisma = Prisma.TransactionClient;

const CAMPOS = {
  id_receta: true,
  nombre: true,
  rendimiento: true,
  tiempo_preparacion_minutos: true,
  instrucciones: true,
  activa: true,
  divisible: true,
  id_producto: true,
  producto: { select: { id_producto: true, nombre: true } },
  detalle_receta: {
    select: {
      id_ingrediente: true,
      cantidad_requerida: true,
      ingrediente: {
        select: {
          nombre: true,
          activo: true,
          unidad_medida: { select: { abreviatura: true } },
        },
      },
    },
  },
} as const;

/**
 * Las recetas se consultan siempre por este modelo y nunca a través de
 * `producto.receta`: el índice parcial `ux_receta_activa` hace que Prisma
 * modele esa relación como uno a uno, cuando un producto tiene varias
 * versiones y solo una activa (RF-PRO-04).
 */
export const listarDeProducto = (idProducto: number) =>
  prisma.receta.findMany({
    where: { id_producto: idProducto },
    select: CAMPOS,
    orderBy: [{ activa: 'desc' }, { id_receta: 'desc' }],
  });

export const buscarPorId = (idReceta: number, tx: ClientePrisma = prisma) =>
  tx.receta.findUnique({ where: { id_receta: idReceta }, select: CAMPOS });

/** Versión activa vigente de un producto, si la hay. */
export const buscarActivaDeProducto = (idProducto: number, tx: ClientePrisma = prisma) =>
  tx.receta.findFirst({
    where: { id_producto: idProducto, activa: true },
    select: { id_receta: true, nombre: true },
  });

export const crear = (
  tx: ClientePrisma,
  datos: {
    idProducto: number;
    nombre: string;
    rendimiento: number;
    tiempoPreparacionMinutos: number;
    instrucciones: string | null;
    activa: boolean;
    divisible: boolean;
  },
) =>
  tx.receta.create({
    data: {
      id_producto: datos.idProducto,
      nombre: datos.nombre,
      rendimiento: datos.rendimiento,
      tiempo_preparacion_minutos: datos.tiempoPreparacionMinutos,
      instrucciones: datos.instrucciones,
      activa: datos.activa,
      divisible: datos.divisible,
    },
    select: { id_receta: true },
  });

export const actualizarCabecera = (
  tx: ClientePrisma,
  idReceta: number,
  datos: {
    nombre?: string;
    rendimiento?: number;
    tiempoPreparacionMinutos?: number;
    instrucciones?: string | null;
    divisible?: boolean;
  },
) =>
  tx.receta.update({
    where: { id_receta: idReceta },
    data: {
      ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
      ...(datos.rendimiento !== undefined ? { rendimiento: datos.rendimiento } : {}),
      ...(datos.tiempoPreparacionMinutos !== undefined
        ? { tiempo_preparacion_minutos: datos.tiempoPreparacionMinutos }
        : {}),
      ...(datos.instrucciones !== undefined ? { instrucciones: datos.instrucciones } : {}),
      ...(datos.divisible !== undefined ? { divisible: datos.divisible } : {}),
    },
  });

export const cambiarActiva = (tx: ClientePrisma, idReceta: number, activa: boolean) =>
  tx.receta.update({ where: { id_receta: idReceta }, data: { activa } });

export const insertarDetalle = (
  tx: ClientePrisma,
  idReceta: number,
  lineas: { id_ingrediente: number; cantidad_requerida: number }[],
) =>
  tx.detalle_receta.createMany({
    data: lineas.map((l) => ({ id_receta: idReceta, ...l })),
  });

/** Solo para actualizaciones: una receta recién creada no tiene detalle que borrar. */
export const reemplazarDetalle = async (
  tx: ClientePrisma,
  idReceta: number,
  lineas: { id_ingrediente: number; cantidad_requerida: number }[],
): Promise<void> => {
  await tx.detalle_receta.deleteMany({ where: { id_receta: idReceta } });
  await insertarDetalle(tx, idReceta, lineas);
};

export const eliminar = (idReceta: number) =>
  prisma.$transaction(async (tx) => {
    await tx.detalle_receta.deleteMany({ where: { id_receta: idReceta } });
    await tx.receta.delete({ where: { id_receta: idReceta } });
  });

export const contarOrdenes = (idReceta: number) =>
  prisma.orden_produccion.count({ where: { id_receta: idReceta } });

/** Insumos activos existentes entre los indicados, para validar el detalle. */
export const insumosExistentes = (ids: number[], tx: ClientePrisma) =>
  tx.ingrediente.findMany({
    where: { id_ingrediente: { in: ids }, activo: true },
    select: { id_ingrediente: true },
  });

export type RecetaConsultada = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;
