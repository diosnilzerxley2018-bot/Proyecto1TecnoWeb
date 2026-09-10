import { prisma } from '../config/prisma.js';

/** Capa Model — consultas de los reportes parametrizados (RF-VEN-07). */

export interface FiltroVentas {
  desde: Date;
  hasta: Date;
  /** Un producto concreto, o todos si se omite. */
  idProducto?: number;
}

/**
 * Ventas del período, con su detalle.
 *
 * Las anuladas quedan fuera: siguen registradas, pero no son ingresos y
 * sumarlas daría un total que no corresponde con la caja.
 */
export const ventasDelPeriodo = (filtro: FiltroVentas) =>
  prisma.venta.findMany({
    where: {
      fecha: { gte: filtro.desde, lte: filtro.hasta },
      estado_pago: { not: 'Anulado' },
      ...(filtro.idProducto
        ? { detalle_venta: { some: { id_producto: filtro.idProducto } } }
        : {}),
    },
    orderBy: { fecha: 'asc' },
    select: {
      id_venta: true,
      fecha: true,
      tipo_venta: true,
      metodo_pago: true,
      estado_pago: true,
      total: true,
      detalle_venta: {
        select: {
          id_producto: true,
          cantidad: true,
          precio_unitario: true,
          producto_almacen: { select: { producto: { select: { nombre: true } } } },
        },
      },
    },
  });

/** Nombre de un producto, para encabezar el reporte cuando se filtra por uno. */
export const nombreDeProducto = (idProducto: number) =>
  prisma.producto.findUnique({
    where: { id_producto: idProducto },
    select: { nombre: true },
  });

/* ------------------------------------------------------------------ */
/* RF-PED-10 — pedidos por fecha, estado y repartidor                  */
/* ------------------------------------------------------------------ */

export interface FiltroPedidos {
  desde: Date;
  hasta: Date;
  estado?: string;
  idRepartidor?: number;
}

/**
 * Pedidos del período con lo necesario para medir la entrega.
 *
 * `fecha_entrega` es lo que permite calcular cuánto tardó cada uno: el
 * requisito pide incluir el tiempo de entrega, y ese dato no está guardado
 * sino que se deduce de las dos marcas de tiempo.
 */
export const pedidosDelPeriodo = (filtro: FiltroPedidos) =>
  prisma.pedido.findMany({
    where: {
      fecha: { gte: filtro.desde, lte: filtro.hasta },
      ...(filtro.estado ? { estado_pedido: filtro.estado } : {}),
      ...(filtro.idRepartidor ? { id_repartidor: filtro.idRepartidor } : {}),
    },
    orderBy: { fecha: 'asc' },
    select: {
      id_pedido: true,
      fecha: true,
      fecha_entrega: true,
      estado_pedido: true,
      estado_pago: true,
      metodo_pago: true,
      total: true,
      empleado: { select: { id_empleado: true, usuario: { select: { nombre: true, apellido: true } } } },
    },
  });

/* ------------------------------------------------------------------ */
/* RF-PRO-08 — producción por fecha y producto                         */
/* ------------------------------------------------------------------ */

export interface FiltroProduccion {
  desde: Date;
  hasta: Date;
  idProducto?: number;
}

/**
 * Órdenes ejecutadas en el período, con su receta y sus insumos.
 *
 * Solo las finalizadas: una orden cancelada no consumió nada y no es
 * producción. El costo por corrida se calcula desde el detalle de la receta,
 * igual que lo hace el servicio de producción.
 */
export const produccionDelPeriodo = (filtro: FiltroProduccion) =>
  prisma.orden_produccion.findMany({
    where: {
      estado: 'Finalizada',
      fecha_finalizacion: { gte: filtro.desde, lte: filtro.hasta },
      ...(filtro.idProducto ? { receta: { id_producto: filtro.idProducto } } : {}),
    },
    orderBy: { fecha_finalizacion: 'asc' },
    select: {
      id_orden_produccion: true,
      fecha_finalizacion: true,
      cantidad: true,
      instantanea: true,
      /* El resultado real de la corrida (H5, H10): lo obtenido y su costo. */
      cantidad_obtenida: true,
      costo_total: true,
      receta: {
        select: {
          nombre: true,
          rendimiento: true,
          producto: { select: { id_producto: true, nombre: true } },
          detalle_receta: {
            select: {
              cantidad_requerida: true,
              ingrediente: {
                select: {
                  id_ingrediente: true,
                  nombre: true,
                  costo_unitario: true,
                  unidad_medida: { select: { abreviatura: true } },
                },
              },
            },
          },
        },
      },
    },
  });

/* ------------------------------------------------------------------ */
/* RF-INV-08 — movimientos de inventario                               */
/* ------------------------------------------------------------------ */

export interface FiltroMovimientos {
  desde: Date;
  hasta: Date;
  idIngrediente?: number;
  idProducto?: number;
}

/**
 * Lo que el reporte necesita saber de un insumo.
 *
 * El detalle de una nota no apunta al ingrediente sino a su fila de stock
 * (`ingrediente_almacen`, clave compuesta insumo+almacén), igual que el
 * detalle de producto pasa por `producto_almacen`. Se comparte entre ingresos
 * y egresos para que ambos nombren el insumo de la misma forma.
 */
const SOLO_INSUMO = {
  select: {
    id_ingrediente: true,
    nombre: true,
    unidad_medida: { select: { abreviatura: true } },
  },
} as const;

/** Entradas del período: notas de ingreso, con su detalle. */
export const ingresosDelPeriodo = (filtro: FiltroMovimientos) =>
  prisma.nota_ingreso.findMany({
    where: { fecha: { gte: filtro.desde, lte: filtro.hasta } },
    orderBy: { fecha: 'asc' },
    select: {
      id_nota_ingreso: true,
      fecha: true,
      motivo: true,
      detalle_ingreso_insumo: {
        where: filtro.idIngrediente ? { id_ingrediente: filtro.idIngrediente } : {},
        select: {
          cantidad: true,
          costo_unitario: true,
          ingrediente_almacen: { select: { ingrediente: SOLO_INSUMO } },
        },
      },
      detalle_ingreso_producto: {
        where: filtro.idProducto ? { id_producto: filtro.idProducto } : {},
        select: {
          cantidad: true,
          costo_unitario: true,
          producto_almacen: { select: { producto: { select: { id_producto: true, nombre: true } } } },
        },
      },
    },
  });

/** Salidas del período: notas de egreso, con su detalle. */
export const egresosDelPeriodo = (filtro: FiltroMovimientos) =>
  prisma.nota_egreso.findMany({
    where: { fecha: { gte: filtro.desde, lte: filtro.hasta } },
    orderBy: { fecha: 'asc' },
    select: {
      id_nota_egreso: true,
      fecha: true,
      motivo: true,
      detalle_egreso_insumo: {
        where: filtro.idIngrediente ? { id_ingrediente: filtro.idIngrediente } : {},
        select: {
          cantidad: true,
          ingrediente_almacen: { select: { ingrediente: SOLO_INSUMO } },
        },
      },
      detalle_egreso_producto: {
        where: filtro.idProducto ? { id_producto: filtro.idProducto } : {},
        select: {
          cantidad: true,
          producto_almacen: { select: { producto: { select: { id_producto: true, nombre: true } } } },
        },
      },
    },
  });

export const nombreDeInsumo = (idIngrediente: number) =>
  prisma.ingrediente.findUnique({
    where: { id_ingrediente: idIngrediente },
    select: { nombre: true },
  });

export const nombreDeRepartidor = (idEmpleado: number) =>
  prisma.empleado.findUnique({
    where: { id_empleado: idEmpleado },
    select: { usuario: { select: { nombre: true, apellido: true } } },
  });
