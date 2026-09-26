import { prisma } from '../config/prisma.js';
import { recorte, rangoDeFechas, type DatosPaginacion } from '../dtos/paginacion.dto.js';
import type { ClientePrisma } from './stock.model.js';

/** Capa Model — clase de análisis tblOrdenProduccion. */

const ORDEN_COMPLETA = {
  select: {
    id_orden_produccion: true,
    fecha: true,
    cantidad: true,
    estado: true,
    fecha_finalizacion: true,
    id_nota_egreso: true,
    id_nota_ingreso: true,
    cantidad_obtenida: true,
    costo_total: true,
    /*
     * Hallazgo H6: para una orden finalizada, lo consumido se lee de la nota
     * de egreso —que registró lo que salió de verdad— y no de la receta, que
     * puede haberse editado después. La receta sigue sirviendo para las
     * órdenes que todavía no se ejecutaron, donde es una previsión.
     */
    nota_egreso: {
      select: {
        detalle_egreso_insumo: {
          select: {
            cantidad: true,
            id_ingrediente: true,
            ingrediente_almacen: {
              select: {
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
    },
    /** El almacén al que fue a parar el producto terminado (hallazgo H4). */
    nota_ingreso: {
      select: {
        detalle_ingreso_producto: {
          select: {
            cantidad: true,
            costo_unitario: true,
            id_almacen: true,
            producto_almacen: { select: { almacen: { select: { nombre: true } } } },
          },
        },
      },
    },
    empleado: {
      select: { id_empleado: true, usuario: { select: { nombre: true, apellido: true } } },
    },
    receta: {
      select: {
        id_receta: true,
        nombre: true,
        rendimiento: true,
        activa: true,
        producto: {
          select: { id_producto: true, nombre: true, tipo_conservacion: true },
        },
        detalle_receta: {
          select: {
            id_ingrediente: true,
            cantidad_requerida: true,
            ingrediente: {
              select: {
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
} as const;

export interface FiltroOrdenes extends DatosPaginacion {
  estado?: string;
  desde?: string;
  hasta?: string;
}

/** Una página de órdenes y cuántas hay en total (H7). */
export const listar = (filtro: FiltroOrdenes) => {
  const rango = rangoDeFechas(filtro);
  const where = {
    ...(filtro.estado ? { estado: filtro.estado } : {}),
    ...(Object.keys(rango).length > 0 ? { fecha: rango } : {}),
  };

  return prisma.$transaction([
    prisma.orden_produccion.findMany({
      where,
      orderBy: { fecha: 'desc' },
      ...ORDEN_COMPLETA,
      ...recorte(filtro),
    }),
    prisma.orden_produccion.count({ where }),
  ]);
};

/**
 * Cuántas órdenes hay en cada estado (H7).
 *
 * Como en el tablero de pedidos: el recuento es de **todas**, no de la página
 * visible, y se agrupa en la base en lugar de traerlas todas para contarlas.
 */
export const contarPorEstado = (filtro: { desde?: string; hasta?: string }) => {
  const rango = rangoDeFechas(filtro);
  return prisma.orden_produccion.groupBy({
    by: ['estado'],
    _count: { _all: true },
    ...(Object.keys(rango).length > 0 ? { where: { fecha: rango } } : {}),
  });
};

export const buscarPorId = (id: number, tx: ClientePrisma = prisma) =>
  tx.orden_produccion.findUnique({ where: { id_orden_produccion: id }, ...ORDEN_COMPLETA });

/**
 * Lectura ligera del estado, sin relaciones.
 *
 * Dentro de una transacción el cliente queda fijado a una sola conexión, y una
 * consulta con varias relaciones hermanas hace que Prisma las cargue en
 * paralelo sobre ella. Para releer el estado basta esta consulta plana.
 */
export const estadoActual = (id: number, tx: ClientePrisma) =>
  tx.orden_produccion.findUnique({
    where: { id_orden_produccion: id },
    select: { estado: true },
  });

export const crear = (
  datos: { idReceta: number; cantidad: number; idEmpleado: number; instantanea?: boolean },
  tx: ClientePrisma = prisma,
) =>
  tx.orden_produccion.create({
    data: {
      id_receta: datos.idReceta,
      cantidad: datos.cantidad,
      id_empleado: datos.idEmpleado,
      instantanea: datos.instantanea ?? false,
      // La producción al instante nace ya en proceso: se ejecuta en el acto.
      ...(datos.instantanea ? { estado: 'En proceso' } : {}),
    },
    select: { id_orden_produccion: true },
  });

export const cambiarEstado = (id: number, estado: string, tx: ClientePrisma = prisma) =>
  tx.orden_produccion.update({
    where: { id_orden_produccion: id },
    data: { estado },
  });

/**
 * Cierra la orden enlazándola a las dos notas generadas.
 * CU-PRO-02: "el sistema actualiza ambos stocks y enlaza las dos notas a la orden".
 */
export const finalizar = (
  tx: ClientePrisma,
  id: number,
  datos: {
    idNotaEgreso: number;
    /** Nulo cuando no se obtuvo nada: no hay producto que ingresar. */
    idNotaIngreso: number | null;
    cantidadObtenida: number;
    costoTotal: number;
  },
) =>
  tx.orden_produccion.update({
    where: { id_orden_produccion: id },
    data: {
      estado: 'Finalizada',
      fecha_finalizacion: new Date(),
      id_nota_egreso: datos.idNotaEgreso,
      id_nota_ingreso: datos.idNotaIngreso,
      cantidad_obtenida: datos.cantidadObtenida,
      costo_total: datos.costoTotal,
    },
  });

/**
 * Receta con lo necesario para planificar una corrida: rendimiento, insumos y
 * su costo. Permite calcular y verificar antes de registrar la orden.
 */
export const recetaParaPlanificar = (idReceta: number) =>
  prisma.receta.findUnique({
    where: { id_receta: idReceta },
    select: {
      id_receta: true,
      // Para nombrar la receta cuando la cantidad pedida no respeta su divisibilidad.
      nombre: true,
      activa: true,
      rendimiento: true,
      divisible: true,
      detalle_receta: {
        select: {
          id_ingrediente: true,
          cantidad_requerida: true,
          ingrediente: {
            select: {
              nombre: true,
              costo_unitario: true,
              unidad_medida: { select: { abreviatura: true } },
            },
          },
        },
      },
    },
  });

export type RecetaPlanificable = NonNullable<Awaited<ReturnType<typeof recetaParaPlanificar>>>;

/**
 * Receta activa de un producto, con lo necesario para producirlo al instante.
 *
 * CU-PRO-02 solo admite producir a partir de la receta vigente; un producto sin
 * ella no es elaborable y debe venderse de existencias.
 */
export const recetaActivaDeProducto = (idProducto: number, tx: ClientePrisma = prisma) =>
  tx.receta.findFirst({
    where: { id_producto: idProducto, activa: true },
    select: {
      id_receta: true,
      nombre: true,
      rendimiento: true,
      divisible: true,
      producto: { select: { id_producto: true, nombre: true, tipo_conservacion: true } },
      detalle_receta: {
        select: {
          id_ingrediente: true,
          cantidad_requerida: true,
          ingrediente: {
            select: {
              nombre: true,
              costo_unitario: true,
              unidad_medida: { select: { abreviatura: true } },
            },
          },
        },
      },
    },
  });

export type RecetaActiva = NonNullable<Awaited<ReturnType<typeof recetaActivaDeProducto>>>;

/** Almacenes que admiten una condición de conservación determinada. */
export const almacenesPorConservacion = (tipoConservacion: string, tx: ClientePrisma) =>
  tx.almacen.findMany({
    where: { tipo_conservacion: tipoConservacion },
    select: { id_almacen: true, nombre: true, preferido: true },
    // El preferido primero: es el que el sistema elige si nadie indica otro.
    orderBy: [{ preferido: 'desc' }, { id_almacen: 'asc' }],
  });

export type OrdenConsultada = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;

/* ------------------------------------------------------------------ */
/* Buscador general del personal                                        */
/* ------------------------------------------------------------------ */

/** Una orden de producción por su número. */
export const porNumero = (numero: number) =>
  prisma.orden_produccion.findMany({
    where: { id_orden_produccion: numero },
    select: {
      id_orden_produccion: true,
      fecha: true,
      estado: true,
      cantidad: true,
      receta: { select: { producto: { select: { nombre: true } } } },
    },
  });
