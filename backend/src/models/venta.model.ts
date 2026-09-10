import { prisma } from '../config/prisma.js';
import { recorte, rangoDeFechas, type DatosPaginacion } from '../dtos/paginacion.dto.js';
import type { ClientePrisma } from './stock.model.js';

/** Capa Model — clases de análisis tblVenta y tblDetalleVenta. */

/**
 * El detalle referencia a `producto_almacen`, no a `producto`: su clave
 * primaria incluye el almacén de origen, que es lo que documenta de dónde
 * salió la mercadería. El nombre del producto se obtiene atravesando esa
 * relación.
 */
const DETALLE = {
  select: {
    id_producto: true,
    id_almacen: true,
    cantidad: true,
    precio_unitario: true,
    producto_almacen: {
      select: {
        producto: { select: { nombre: true } },
        almacen: { select: { nombre: true } },
      },
    },
  },
} as const;

const VENTA_COMPLETA = {
  detalle_venta: DETALLE,
  empleado: { select: { id_empleado: true, usuario: { select: { nombre: true, apellido: true } } } },
  cliente: {
    select: { id_cliente: true, usuario: { select: { nombre: true, apellido: true } } },
  },
} as const;

export interface FiltroVentas extends DatosPaginacion {
  tipoVenta?: string;
  idCliente?: number;
  desde?: string;
  hasta?: string;
}

/**
 * Una página de ventas y cuántas hay en total (H7).
 *
 * Las dos consultas van en la **misma transacción**: si se hicieran sueltas,
 * una venta registrada entre ambas haría que el total no correspondiera con la
 * página y la última quedaría descuadrada.
 */
export const listar = (filtro: FiltroVentas) => {
  const rango = rangoDeFechas(filtro);
  const where = {
    ...(filtro.tipoVenta ? { tipo_venta: filtro.tipoVenta } : {}),
    ...(filtro.idCliente ? { id_cliente: filtro.idCliente } : {}),
    ...(Object.keys(rango).length > 0 ? { fecha: rango } : {}),
  };

  return prisma.$transaction([
    prisma.venta.findMany({
      where,
      orderBy: { fecha: 'desc' },
      include: VENTA_COMPLETA,
      ...recorte(filtro),
    }),
    prisma.venta.count({ where }),
  ]);
};

export const buscarPorId = (id: number) =>
  prisma.venta.findUnique({ where: { id_venta: id }, include: VENTA_COMPLETA });

/** La escritura devuelve solo el identificador; el servicio vuelve a leer. */
export const crear = (
  tx: ClientePrisma,
  datos: {
    tipoVenta: string;
    metodoPago: string;
    estadoPago: string;
    total: number;
    idCliente: number | null;
    idEmpleado: number;
  },
) =>
  tx.venta.create({
    data: {
      tipo_venta: datos.tipoVenta,
      metodo_pago: datos.metodoPago,
      estado_pago: datos.estadoPago,
      total: datos.total,
      id_cliente: datos.idCliente,
      id_empleado: datos.idEmpleado,
    },
    select: { id_venta: true },
  });

/** Lectura plana del estado, para releerlo dentro de una transacción. */
export const estadoDePago = (idVenta: number, tx: ClientePrisma) =>
  tx.venta.findUnique({ where: { id_venta: idVenta }, select: { estado_pago: true } });

/** Refleja en la venta el desenlace de su cobro. */
export const marcarEstadoPago = (tx: ClientePrisma, idVenta: number, estadoPago: string) =>
  tx.venta.update({ where: { id_venta: idVenta }, data: { estado_pago: estadoPago } });

export const crearDetalle = (
  tx: ClientePrisma,
  lineas: {
    id_venta: number;
    id_producto: number;
    id_almacen: number;
    cantidad: number;
    precio_unitario: number;
  }[],
) => tx.detalle_venta.createMany({ data: lineas });

/** Precios vigentes en el servidor: nunca se confía en el precio del navegador. */
export const preciosVigentes = (idsProducto: number[], tx: ClientePrisma) =>
  tx.producto.findMany({
    where: { id_producto: { in: idsProducto }, activo: true },
    select: { id_producto: true, nombre: true, precio_venta: true },
  });

export type VentaConsultada = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;
