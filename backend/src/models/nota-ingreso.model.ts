import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { recorte, rangoDeFechas, type DatosPaginacion } from '../dtos/paginacion.dto.js';
import type { ClientePrisma } from './stock.model.js';
import { contieneTodas } from './busqueda-texto.js';

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
          select: {
            nombre: true,
            controla_vencimiento: true,
            unidad_medida: { select: { abreviatura: true } },
          },
        },
        almacen: { select: { nombre: true } },
      },
    },
    // El lote de un perecedero, con lo que queda de él en cada almacén.
    lote: {
      select: {
        codigo: true,
        fecha_vencimiento: true,
        lote_almacen: { select: { id_almacen: true, stock_actual: true } },
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
  /** Solo las notas que traen alguno de estos insumos (búsqueda por nombre). */
  idsInsumo?: number[];
  idsProducto?: number[];
  /** Solo las notas que traen insumos, o productos. */
  tipo?: 'insumo' | 'producto';
}

/**
 * Qué líneas tiene que traer una nota para entrar al listado. Sin búsqueda ni
 * tipo, cualquiera; con búsqueda, alguna del ítem buscado, del tipo pedido.
 */
function porLineas(filtro: FiltroNotas) {
  const conInsumo = {
    detalle_ingreso_insumo: {
      some: filtro.idsInsumo ? { id_ingrediente: { in: filtro.idsInsumo } } : {},
    },
  };
  const conProducto = {
    detalle_ingreso_producto: {
      some: filtro.idsProducto ? { id_producto: { in: filtro.idsProducto } } : {},
    },
  };
  if (filtro.tipo === 'insumo') return conInsumo;
  if (filtro.tipo === 'producto') return conProducto;
  if (filtro.idsInsumo || filtro.idsProducto) return { OR: [conInsumo, conProducto] };
  return {};
}

/** Una página de notas y cuántas hay en total (H7). */
export const listar = (filtro: FiltroNotas) => {
  const rango = rangoDeFechas(filtro);
  const where = {
    ...(filtro.motivo ? { motivo: filtro.motivo } : {}),
    ...(Object.keys(rango).length > 0 ? { fecha: rango } : {}),
    ...porLineas(filtro),
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
    /** En una Reposición, la devolución que repone. */
    idNotaEgreso?: number | null;
  },
) =>
  tx.nota_ingreso.create({
    data: {
      motivo: datos.motivo,
      proveedor: datos.proveedor,
      numero_documento: datos.numeroDocumento,
      total: datos.total,
      id_empleado: datos.idEmpleado,
      id_nota_egreso: datos.idNotaEgreso ?? null,
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
    id_lote: number | null;
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

/* ------------------------------------------------------------------ */
/* Inventario › Lotes, vista por ítem                                  */
/* ------------------------------------------------------------------ */

export interface FiltroLotes extends DatosPaginacion {
  motivo?: string;
  desde?: string;
  hasta?: string;
  termino?: string;
  tipo?: 'insumo' | 'producto';
}

/** Una línea de ingreso vista como lote de su ítem. */
export interface FilaLote {
  tipo: 'insumo' | 'producto';
  id_nota_ingreso: number;
  fecha: Date;
  motivo: string;
  proveedor: string | null;
  numero_documento: string | null;
  id_item: number;
  nombre: string;
  unidad: string;
  id_almacen: number;
  almacen: string;
  cantidad: number;
  costo_unitario: number;
  codigo_lote: string | null;
  fecha_vencimiento: Date | null;
  queda: number | null;
  /** El costo del insumo hoy; nulo en los productos, que lo calculan aparte. */
  costo_actual: number | null;
}

/**
 * Las líneas de ingreso de insumos y de productos, en una sola lista.
 *
 * Viven en dos tablas y la lista se ordena y pagina entera, así que se unen en
 * SQL: traer las dos y mezclarlas en memoria obligaría a cargar todas para
 * mostrar veinte. Lo buscado viaja como parámetro (`contieneTodas`), y el
 * producto se busca también por su categoría, como en su listado.
 */
function lineasComoLotes(filtro: FiltroLotes): Prisma.Sql {
  const rango = rangoDeFechas(filtro);
  const comunes = Prisma.join(
    [
      filtro.motivo ? Prisma.sql`n.motivo = ${filtro.motivo}` : Prisma.sql`TRUE`,
      rango.gte ? Prisma.sql`n.fecha >= ${rango.gte}` : Prisma.sql`TRUE`,
      rango.lte ? Prisma.sql`n.fecha <= ${rango.lte}` : Prisma.sql`TRUE`,
    ],
    ' AND ',
  );
  const termino = filtro.termino ?? '';

  const insumos = Prisma.sql`
    SELECT 'insumo'::text AS tipo, n.id_nota_ingreso, n.fecha, n.motivo, n.proveedor,
           n.numero_documento, d.id_ingrediente AS id_item, i.nombre, u.abreviatura AS unidad,
           d.id_almacen, a.nombre AS almacen, d.cantidad::float8 AS cantidad,
           d.costo_unitario::float8 AS costo_unitario, l.codigo AS codigo_lote,
           l.fecha_vencimiento, la.stock_actual::float8 AS queda,
           i.costo_unitario::float8 AS costo_actual
      FROM detalle_ingreso_insumo d
      JOIN nota_ingreso n  ON n.id_nota_ingreso = d.id_nota_ingreso
      JOIN ingrediente i   ON i.id_ingrediente = d.id_ingrediente
      JOIN unidad_medida u ON u.id_unidad = i.id_unidad
      JOIN almacen a       ON a.id_almacen = d.id_almacen
      LEFT JOIN lote l          ON l.id_lote = d.id_lote
      LEFT JOIN lote_almacen la ON la.id_lote = d.id_lote AND la.id_almacen = d.id_almacen
     WHERE ${comunes} AND ${contieneTodas(Prisma.sql`i.nombre`, termino)}`;

  const productos = Prisma.sql`
    SELECT 'producto'::text AS tipo, n.id_nota_ingreso, n.fecha, n.motivo, n.proveedor,
           n.numero_documento, d.id_producto AS id_item, p.nombre, 'u'::text AS unidad,
           d.id_almacen, a.nombre AS almacen, d.cantidad::float8 AS cantidad,
           d.costo_unitario::float8 AS costo_unitario, NULL::varchar AS codigo_lote,
           NULL::date AS fecha_vencimiento, NULL::float8 AS queda,
           NULL::float8 AS costo_actual
      FROM detalle_ingreso_producto d
      JOIN nota_ingreso n ON n.id_nota_ingreso = d.id_nota_ingreso
      JOIN producto p     ON p.id_producto = d.id_producto
      JOIN categoria c    ON c.id_categoria = p.id_categoria
      JOIN almacen a      ON a.id_almacen = d.id_almacen
     WHERE ${comunes} AND ${contieneTodas(Prisma.sql`concat_ws(' ', p.nombre, c.nombre)`, termino)}`;

  if (filtro.tipo === 'insumo') return insumos;
  if (filtro.tipo === 'producto') return productos;
  return Prisma.sql`${insumos} UNION ALL ${productos}`;
}

/** Una página de lotes, de la entrada más reciente a la más antigua, y cuántos hay. */
export async function lotes(filtro: FiltroLotes): Promise<[FilaLote[], number]> {
  const union = lineasComoLotes(filtro);
  const [filas, cuenta] = await prisma.$transaction([
    prisma.$queryRaw<FilaLote[]>`
      SELECT * FROM (${union}) x
       ORDER BY fecha DESC, id_nota_ingreso DESC, nombre
       LIMIT ${filtro.porPagina} OFFSET ${(filtro.pagina - 1) * filtro.porPagina}`,
    prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM (${union}) x`,
  ]);
  return [filas, cuenta[0]?.total ?? 0];
}

/** Tope de ítems resumidos: una búsqueda muy amplia no necesita cien resúmenes. */
const TOPE_RESUMEN = 10;

/** Precio mínimo, máximo y último de cada ítem que coincide con la búsqueda. */
export const resumenDeLotes = (filtro: FiltroLotes) =>
  prisma.$queryRaw<
    {
      tipo: 'insumo' | 'producto';
      id_item: number;
      nombre: string;
      unidad: string;
      lotes: number;
      cantidad: number;
      minimo: number;
      maximo: number;
      ultimo: number;
      costo_actual: number | null;
    }[]
  >`
    SELECT tipo, id_item, nombre, unidad,
           count(*)::int AS lotes,
           sum(cantidad)::float8 AS cantidad,
           min(costo_unitario)::float8 AS minimo,
           max(costo_unitario)::float8 AS maximo,
           (array_agg(costo_unitario ORDER BY fecha DESC, id_nota_ingreso DESC))[1]::float8 AS ultimo,
           max(costo_actual)::float8 AS costo_actual
      FROM (${lineasComoLotes(filtro)}) x
     GROUP BY tipo, id_item, nombre, unidad
     ORDER BY nombre
     LIMIT ${TOPE_RESUMEN}`;

/* ------------------------------------------------------------------ */
/* Compra → Devolución → Reposición                                    */
/* ------------------------------------------------------------------ */

/** Una compra con lo que entró, sus precios y el lote de cada perecedero. */
const COMPRA = {
  id_nota_ingreso: true,
  fecha: true,
  motivo: true,
  proveedor: true,
  numero_documento: true,
  detalle_ingreso_insumo: {
    select: { ...DETALLE_INSUMO.select, id_lote: true },
  },
  detalle_ingreso_producto: DETALLE_PRODUCTO,
} as const;

/** Las compras más recientes: las que el formulario ofrece para devolver. */
export const comprasRecientes = (tope: number) =>
  prisma.nota_ingreso.findMany({
    where: { motivo: 'Compra' },
    orderBy: { fecha: 'desc' },
    take: tope,
    select: COMPRA,
  });

/** Unas notas por su número: las compras de las que salieron unas devoluciones. */
export const comprasPorId = (ids: number[], tx: ClientePrisma = prisma) =>
  tx.nota_ingreso.findMany({ where: { id_nota_ingreso: { in: ids } }, select: COMPRA });

/** Las reposiciones de unas devoluciones: cuánto se repuso ya de cada una. */
export const repuestoDe = (idsDevolucion: number[], tx: ClientePrisma = prisma) =>
  tx.nota_ingreso.findMany({
    where: { id_nota_egreso: { in: idsDevolucion } },
    select: {
      id_nota_egreso: true,
      detalle_ingreso_insumo: { select: { id_ingrediente: true, id_almacen: true, cantidad: true } },
      detalle_ingreso_producto: { select: { id_producto: true, id_almacen: true, cantidad: true } },
    },
  });

export type CompraConsultada = Awaited<ReturnType<typeof comprasPorId>>[number];
