import { prisma } from '../config/prisma.js';
import { recorte, rangoDeFechas, type DatosPaginacion } from '../dtos/paginacion.dto.js';
import type { ClientePrisma } from './stock.model.js';

/** Capa Model — clases de análisis tblPedido, tblDetallePedido y tblUbicacion. */

/**
 * El detalle referencia a `producto_almacen`, no a `producto`: la clave del
 * detalle incluye el almacén de origen. El nombre del producto se obtiene
 * atravesando esa relación.
 */
const DETALLE_CON_PRODUCTO = {
  select: {
    id_producto: true,
    id_almacen: true,
    cantidad: true,
    precio_unitario: true,
    producto_almacen: { select: { producto: { select: { nombre: true } } } },
  },
} as const;

const PEDIDO_COMPLETO = {
  ubicacion: true,
  detalle_pedido: DETALLE_CON_PRODUCTO,
} as const;

/** CU-PED-03 — la ubicación se crea junto con el pedido que la usa. */
export const crearUbicacion = (
  tx: ClientePrisma,
  datos: {
    calle: string;
    numero?: string;
    referencia: string;
    latitud?: number;
    longitud?: number;
  },
) =>
  tx.ubicacion.create({
    data: {
      calle: datos.calle,
      numero: datos.numero ?? null,
      referencia: datos.referencia,
      latitud: datos.latitud ?? null,
      longitud: datos.longitud ?? null,
    },
    select: { id_ubicacion: true },
  });

export const crear = (
  tx: ClientePrisma,
  datos: {
    idCliente: number;
    idUbicacion: number;
    metodoPago: string;
    estadoPedido: string;
    estadoPago: string;
    referenciaPago: string | null;
    total: number;
  },
) =>
  tx.pedido.create({
    data: {
      id_cliente: datos.idCliente,
      id_ubicacion: datos.idUbicacion,
      metodo_pago: datos.metodoPago,
      estado_pedido: datos.estadoPedido,
      estado_pago: datos.estadoPago,
      referencia_pago: datos.referenciaPago,
      total: datos.total,
    },
    select: { id_pedido: true },
  });

export const crearDetalle = (
  tx: ClientePrisma,
  lineas: {
    id_pedido: number;
    id_producto: number;
    id_almacen: number;
    cantidad: number;
    precio_unitario: number;
  }[],
) => tx.detalle_pedido.createMany({ data: lineas });

export const listarDeCliente = (idCliente: number) =>
  prisma.pedido.findMany({
    where: { id_cliente: idCliente },
    orderBy: { fecha: 'desc' },
    include: PEDIDO_COMPLETO,
  });

export const buscarDeCliente = (idPedido: number, idCliente: number, tx: ClientePrisma = prisma) =>
  tx.pedido.findFirst({
    where: { id_pedido: idPedido, id_cliente: idCliente },
    include: PEDIDO_COMPLETO,
  });

export const cambiarEstado = (tx: ClientePrisma, idPedido: number, estado: string) =>
  tx.pedido.update({ where: { id_pedido: idPedido }, data: { estado_pedido: estado } });

/** Identificador de la transacción del lado de la pasarela, para reclamos. */
export const registrarReferenciaPago = (idPedido: number, referencia: string | null) =>
  prisma.pedido.update({
    where: { id_pedido: idPedido },
    data: { referencia_pago: referencia },
  });

export const marcarEstadoPago = (tx: ClientePrisma, idPedido: number, estadoPago: string) =>
  tx.pedido.update({ where: { id_pedido: idPedido }, data: { estado_pago: estadoPago } });

/**
 * Pedido con su detalle, sin filtrar por cliente.
 *
 * Lo usa el servicio de pagos, que actúa por cuenta de la pasarela y no de una
 * persona: cuando llega el aviso de cobro no hay sesión de cliente que valga.
 */
export const buscarConDetalle = (idPedido: number, tx: ClientePrisma = prisma) =>
  tx.pedido.findUnique({
    where: { id_pedido: idPedido },
    select: {
      id_pedido: true,
      estado_pedido: true,
      estado_pago: true,
      detalle_pedido: {
        select: { id_producto: true, id_almacen: true, cantidad: true },
      },
    },
  });

/** Precios vigentes en el servidor: nunca se confía en el precio del navegador. */
export const preciosVigentes = (idsProducto: number[], tx: ClientePrisma) =>
  tx.producto.findMany({
    where: { id_producto: { in: idsProducto }, activo: true },
    select: { id_producto: true, nombre: true, precio_venta: true },
  });

export type PedidoConDetalle = NonNullable<Awaited<ReturnType<typeof buscarDeCliente>>>;

/* ------------------------------------------------------------------ */
/* CU-PED-02 — consultas del personal                                  */
/* ------------------------------------------------------------------ */

/**
 * A diferencia de la vista del cliente, la del personal necesita saber a quién
 * se entrega y quién reparte.
 */
const PEDIDO_GESTION = {
  ubicacion: true,
  detalle_pedido: DETALLE_CON_PRODUCTO,
  cliente: {
    select: {
      id_cliente: true,
      usuario: { select: { nombre: true, apellido: true, telefono: true, email: true } },
    },
  },
  empleado: {
    select: {
      id_empleado: true,
      usuario: { select: { nombre: true, apellido: true } },
    },
  },
} as const;

export interface FiltroGestion extends DatosPaginacion {
  estado?: string;
  desde?: string;
  hasta?: string;
}

/** Una página de pedidos y cuántos hay en total (H7). */
export const listarTodos = (filtro: FiltroGestion) => {
  const rango = rangoDeFechas(filtro);
  const where = {
    ...(filtro.estado ? { estado_pedido: filtro.estado } : {}),
    ...(Object.keys(rango).length > 0 ? { fecha: rango } : {}),
  };

  return prisma.$transaction([
    prisma.pedido.findMany({
      where,
      orderBy: { fecha: 'desc' },
      include: PEDIDO_GESTION,
      ...recorte(filtro),
    }),
    prisma.pedido.count({ where }),
  ]);
};

/**
 * Cuántos pedidos hay en cada estado (H7).
 *
 * El tablero del personal necesita el conteo **de todos**, no el de la página
 * que está viendo: si contara la página, "3 en camino" significaría "3 de los
 * 20 que caben en pantalla", que no es lo que el tablero pregunta.
 *
 * Va agrupado en la base y no contando en memoria: traer todos los pedidos
 * para contarlos sería exactamente lo que la paginación vino a evitar.
 */
export const contarPorEstado = (filtro: { desde?: string; hasta?: string }) => {
  const rango = rangoDeFechas(filtro);
  return prisma.pedido.groupBy({
    by: ['estado_pedido'],
    _count: { _all: true },
    ...(Object.keys(rango).length > 0 ? { where: { fecha: rango } } : {}),
  });
};

export const buscarPorId = (idPedido: number) =>
  prisma.pedido.findUnique({ where: { id_pedido: idPedido }, include: PEDIDO_GESTION });

/**
 * Pedidos a nombre de un repartidor, en los estados que lo ocupan.
 *
 * Usa `PEDIDO_GESTION` y no `PEDIDO_COMPLETO` porque el repartidor necesita
 * ver a quién le entrega: el del portal no trae los datos del cliente, que
 * allí sobran porque el cliente es quien mira.
 *
 * Los entregados y los cancelados quedan fuera: siguen a su nombre en el
 * historial, pero ya no son trabajo pendiente.
 */
export const listarDeRepartidor = (idRepartidor: number, estados: string[]) =>
  prisma.pedido.findMany({
    where: { id_repartidor: idRepartidor, estado_pedido: { in: estados } },
    orderBy: [{ estado_pedido: 'desc' }, { fecha: 'asc' }],
    include: PEDIDO_GESTION,
  });

/**
 * Avanza el estado y, cuando corresponde, sella la fecha de entrega
 * (CU-PED-02: "El sistema registra la fecha de entrega").
 */
export const actualizarEstado = (
  idPedido: number,
  estado: string,
  fechaEntrega: Date | null,
  tx: ClientePrisma = prisma,
) =>
  tx.pedido.update({
    where: { id_pedido: idPedido },
    data: { estado_pedido: estado, ...(fechaEntrega ? { fecha_entrega: fechaEntrega } : {}) },
  });

export const asignarRepartidor = (idPedido: number, idRepartidor: number) =>
  prisma.pedido.update({
    where: { id_pedido: idPedido },
    data: { id_repartidor: idRepartidor },
  });

export type PedidoParaGestion = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;
