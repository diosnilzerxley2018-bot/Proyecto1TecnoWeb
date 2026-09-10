import { prisma } from '../config/prisma.js';
import { recorte, rangoDeFechas, type DatosPaginacion } from '../dtos/paginacion.dto.js';
import type { ClientePrisma } from './stock.model.js';

/** Capa Model — clases de análisis tblNotaEgreso y sus dos detalles. */

const DETALLE_INSUMO = {
  select: {
    id_ingrediente: true,
    id_almacen: true,
    cantidad: true,
    ingrediente_almacen: {
      select: {
        ingrediente: {
          select: { nombre: true, unidad_medida: { select: { abreviatura: true } } },
        },
        almacen: { select: { nombre: true } },
      },
    },
  },
} as const;

const DETALLE_PRODUCTO = {
  select: {
    id_producto: true,
    id_almacen: true,
    cantidad: true,
    producto_almacen: {
      select: {
        producto: { select: { nombre: true } },
        almacen: { select: { nombre: true } },
      },
    },
  },
} as const;

const NOTA_COMPLETA = {
  empleado: { select: { id_empleado: true, usuario: { select: { nombre: true, apellido: true } } } },
  detalle_egreso_insumo: DETALLE_INSUMO,
  detalle_egreso_producto: DETALLE_PRODUCTO,
} as const;

export interface FiltroNotas extends DatosPaginacion {
  motivo?: string;
  desde?: string;
  hasta?: string;
}

/** Una página de notas y cuántas hay en total (H7). */
export const listar = (filtro: FiltroNotas) => {
  const rango = rangoDeFechas(filtro);
  const where = {
    ...(filtro.motivo ? { motivo: filtro.motivo } : {}),
    ...(Object.keys(rango).length > 0 ? { fecha: rango } : {}),
  };

  return prisma.$transaction([
    prisma.nota_egreso.findMany({
      where,
      orderBy: { fecha: 'desc' },
      include: NOTA_COMPLETA,
      ...recorte(filtro),
    }),
    prisma.nota_egreso.count({ where }),
  ]);
};

export const buscarPorId = (id: number) =>
  prisma.nota_egreso.findUnique({ where: { id_nota_egreso: id }, include: NOTA_COMPLETA });

export const crear = (
  tx: ClientePrisma,
  datos: { motivo: string; observacion: string | null; idEmpleado: number },
) =>
  tx.nota_egreso.create({
    data: {
      motivo: datos.motivo,
      observacion: datos.observacion,
      id_empleado: datos.idEmpleado,
    },
    select: { id_nota_egreso: true },
  });

export const crearDetalleInsumos = (
  tx: ClientePrisma,
  lineas: {
    id_nota_egreso: number;
    id_ingrediente: number;
    id_almacen: number;
    cantidad: number;
  }[],
) => tx.detalle_egreso_insumo.createMany({ data: lineas });

export const crearDetalleProductos = (
  tx: ClientePrisma,
  lineas: {
    id_nota_egreso: number;
    id_producto: number;
    id_almacen: number;
    cantidad: number;
  }[],
) => tx.detalle_egreso_producto.createMany({ data: lineas });

export type NotaEgresoConsultada = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;
