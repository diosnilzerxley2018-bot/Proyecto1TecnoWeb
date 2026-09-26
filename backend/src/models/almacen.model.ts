import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { contieneTodas, limite } from './busqueda-texto.js';
import type { ClientePrisma } from './stock.model.js';

/** Capa Model — clase de análisis tblAlmacen. */

const CAMPOS = {
  id_almacen: true,
  nombre: true,
  tipo_conservacion: true,
  ubicacion_fisica: true,
  preferido: true,
} as const;

/**
 * Prisma modela el índice parcial `ux_almacen_preferido` como si
 * `tipo_conservacion` fuera única, que es un artefacto de la introspección: la
 * unicidad solo rige sobre las filas con `preferido = true`. Por eso los
 * almacenes se buscan siempre por identificador o por nombre, nunca por su
 * conservación con `findUnique`.
 */

export const listar = () =>
  prisma.almacen.findMany({ select: CAMPOS, orderBy: { nombre: 'asc' } });

export const buscarPorId = (id: number) =>
  prisma.almacen.findUnique({ where: { id_almacen: id }, select: CAMPOS });

export const buscarPorNombre = (nombre: string) =>
  prisma.almacen.findUnique({ where: { nombre }, select: { id_almacen: true } });

export const crear = (datos: {
  nombre: string;
  tipoConservacion: string;
  ubicacionFisica: string | null;
}) =>
  prisma.almacen.create({
    data: {
      nombre: datos.nombre,
      tipo_conservacion: datos.tipoConservacion,
      ubicacion_fisica: datos.ubicacionFisica,
    },
    select: CAMPOS,
  });

export const actualizar = (
  id: number,
  datos: {
    nombre?: string;
    tipoConservacion?: string;
    ubicacionFisica?: string | null;
    preferido?: boolean;
  },
) =>
  prisma.almacen.update({
    where: { id_almacen: id },
    data: {
      ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
      ...(datos.tipoConservacion !== undefined
        ? { tipo_conservacion: datos.tipoConservacion }
        : {}),
      ...(datos.ubicacionFisica !== undefined
        ? { ubicacion_fisica: datos.ubicacionFisica }
        : {}),
      ...(datos.preferido !== undefined ? { preferido: datos.preferido } : {}),
    },
    select: CAMPOS,
  });

/** Quita la preferencia a los demás almacenes de la misma conservación. */
export const quitarPreferenciaDe = (tipoConservacion: string, excepto: number) =>
  prisma.almacen.updateMany({
    where: { tipo_conservacion: tipoConservacion, preferido: true, NOT: { id_almacen: excepto } },
    data: { preferido: false },
  });

export const eliminar = (id: number) => prisma.almacen.delete({ where: { id_almacen: id } });

/**
 * Cuenta las filas de existencias que dependen del almacén.
 *
 * Basta con mirar las dos tablas de stock: todos los detalles de ingreso,
 * egreso, venta y pedido referencian a `(item, almacén)` de esas tablas, de
 * modo que sin fila de stock no puede haber ningún movimiento.
 */
export async function contarDependencias(id: number): Promise<number> {
  const [productos, insumos] = await Promise.all([
    prisma.producto_almacen.count({ where: { id_almacen: id } }),
    prisma.ingrediente_almacen.count({ where: { id_almacen: id } }),
  ]);
  return productos + insumos;
}

export type AlmacenConsultado = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;

/** Almacenes existentes entre los indicados. */
export const existentes = (ids: number[], tx: ClientePrisma) =>
  tx.almacen.findMany({
    where: { id_almacen: { in: ids } },
    select: { id_almacen: true, nombre: true, tipo_conservacion: true },
  });

/* ------------------------------------------------------------------ */
/* Buscador general del personal                                        */
/* ------------------------------------------------------------------ */

/** Almacenes cuyo nombre, conservación o ubicación contienen lo buscado. */
export async function coincidencias(termino: string, tope: number) {
  const filas = await prisma.$queryRaw<{ id_almacen: number }[]>`
    SELECT id_almacen FROM almacen
    WHERE ${contieneTodas(
      Prisma.sql`concat_ws(' ', nombre, tipo_conservacion, ubicacion_fisica)`,
      termino,
    )}
    ORDER BY nombre
    ${limite(tope)}`;
  return prisma.almacen.findMany({
    where: { id_almacen: { in: filas.map((f) => f.id_almacen) } },
    select: CAMPOS,
    orderBy: { nombre: 'asc' },
  });
}
