import { prisma } from '../config/prisma.js';
import { recorte, rangoDeFechas, type DatosPaginacion } from '../dtos/paginacion.dto.js';
import type { ClientePrisma } from './stock.model.js';

/** Capa Model — clases de análisis tblNotaIngreso y sus dos detalles. */

const DETALLE_INSUMO = {
  select: {
    id_ingrediente: true,
    id_almacen: true,
    cantidad: true,
    costo_unitario: true,
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
    costo_unitario: true,
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
  detalle_ingreso_insumo: DETALLE_INSUMO,
  detalle_ingreso_producto: DETALLE_PRODUCTO,
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
    prisma.nota_ingreso.findMany({
      where,
      orderBy: { fecha: 'desc' },
      include: NOTA_COMPLETA,
      ...recorte(filtro),
    }),
    prisma.nota_ingreso.count({ where }),
  ]);
};

export const buscarPorId = (id: number) =>
  prisma.nota_ingreso.findUnique({ where: { id_nota_ingreso: id }, include: NOTA_COMPLETA });

/** La escritura devuelve solo el identificador; el servicio vuelve a leer. */
export const crear = (
  tx: ClientePrisma,
  datos: {
    motivo: string;
    proveedor: string | null;
    numeroDocumento: string | null;
    total: number;
    idEmpleado: number;
  },
) =>
  tx.nota_ingreso.create({
    data: {
      motivo: datos.motivo,
      proveedor: datos.proveedor,
      numero_documento: datos.numeroDocumento,
      total: datos.total,
      id_empleado: datos.idEmpleado,
    },
    select: { id_nota_ingreso: true },
  });

export const crearDetalleInsumos = (
  tx: ClientePrisma,
  lineas: {
    id_nota_ingreso: number;
    id_ingrediente: number;
    id_almacen: number;
    cantidad: number;
    costo_unitario: number;
  }[],
) => tx.detalle_ingreso_insumo.createMany({ data: lineas });

export const crearDetalleProductos = (
  tx: ClientePrisma,
  lineas: {
    id_nota_ingreso: number;
    id_producto: number;
    id_almacen: number;
    cantidad: number;
    costo_unitario: number;
  }[],
) => tx.detalle_ingreso_producto.createMany({ data: lineas });

export type NotaIngresoConsultada = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;
