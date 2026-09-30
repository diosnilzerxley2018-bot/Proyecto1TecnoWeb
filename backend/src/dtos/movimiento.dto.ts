import { z } from 'zod';
import { cantidadDeInsumo } from './cantidad.dto.js';
import { camposDeFecha, camposDePagina, type Pagina } from './paginacion.dto.js';
import {
  MOTIVO_DEVOLUCION,
  MOTIVO_REPOSICION,
  MOTIVO_SOLO_PRODUCTOS,
  MOTIVOS_EGRESO,
  MOTIVOS_EGRESO_MANUAL,
  MOTIVOS_INGRESO,
  MOTIVOS_INGRESO_MANUAL,
  type MotivoEgreso,
  type MotivoIngreso,
} from '../config/dominio.js';

/**
 * CU-INV-03 Gestionar Ingreso y CU-INV-04 Gestionar Egreso.
 *
 * Ambas notas admiten insumos, productos terminados o ambos, por eso el cuerpo
 * lleva dos listas separadas; solo la devolución admite únicamente productos
 * (`MOTIVO_SOLO_PRODUCTOS`). Los tipos de cantidad difieren porque así los
 * declara el esquema: los productos se cuentan en unidades enteras y los
 * insumos admiten tres decimales, el gramo o el mililitro.
 */

const cantidadInsumo = cantidadDeInsumo('la cantidad');

const cantidadProducto = z
  .number()
  .int('la cantidad de un producto debe ser un número entero')
  .gt(0, 'la cantidad debe ser mayor a cero')
  .max(99999999);

const costoUnitario = z.number().min(0, 'el costo unitario no puede ser negativo').max(99999999.99);

const esquemaLineaInsumoIngreso = z.object({
  idIngrediente: z.number().int().positive(),
  idAlmacen: z.number().int().positive(),
  cantidad: cantidadInsumo,
  costoUnitario,
  /**
   * Lote y vencimiento. Solo son obligatorios para los insumos marcados como
   * perecederos; el servidor lo verifica contra `controla_vencimiento`.
   */
  codigoLote: z.string().trim().max(50).optional(),
  fechaVencimiento: z.iso.date().optional(),
});

const esquemaLineaProductoIngreso = z.object({
  idProducto: z.number().int().positive(),
  idAlmacen: z.number().int().positive(),
  cantidad: cantidadProducto,
  costoUnitario,
});

const esquemaLineaInsumoEgreso = z.object({
  idIngrediente: z.number().int().positive(),
  idAlmacen: z.number().int().positive(),
  cantidad: cantidadInsumo,
});

const esquemaLineaProductoEgreso = z.object({
  idProducto: z.number().int().positive(),
  idAlmacen: z.number().int().positive(),
  cantidad: cantidadProducto,
});

const alMenosUnaLinea = (datos: { insumos: unknown[]; productos: unknown[] }) =>
  datos.insumos.length + datos.productos.length > 0;

const MENSAJE_SIN_LINEAS = 'La nota debe contener al menos un insumo o un producto';

/*
 * A mano no se registra el motivo Producción: lo escribe la orden al
 * finalizarse (ver `MOTIVOS_INGRESO_MANUAL`). El listado sí filtra por él.
 */
export const esquemaCrearIngreso = z
  .object({
    motivo: z
      .enum(MOTIVOS_INGRESO_MANUAL, {
        error:
          'el motivo debe ser Compra, Reposición, Ajuste o Devolución; lo elaborado lo ingresa la orden de producción al finalizarse',
      })
      .default('Compra'),
    proveedor: z.string().trim().max(150).nullable().optional(),
    numeroDocumento: z.string().trim().max(50).nullable().optional(),
    /** En una Reposición, la devolución al proveedor que repone. */
    idNotaEgreso: z.number().int().positive().optional(),
    insumos: z.array(esquemaLineaInsumoIngreso).max(100).default([]),
    productos: z.array(esquemaLineaProductoIngreso).max(100).default([]),
  })
  .refine(alMenosUnaLinea, { message: MENSAJE_SIN_LINEAS, path: ['insumos'] })
  .refine((datos) => (datos.motivo === MOTIVO_REPOSICION) === (datos.idNotaEgreso !== undefined), {
    message:
      'una reposición indica la devolución al proveedor que repone, y solo una reposición la indica',
    path: ['idNotaEgreso'],
  })
  .refine((datos) => datos.motivo !== MOTIVO_SOLO_PRODUCTOS || datos.insumos.length === 0, {
    message:
      'una devolución de cliente es de productos terminados; un insumo de más se registra como Ajuste',
    path: ['insumos'],
  });

export const esquemaCrearEgreso = z
  .object({
    motivo: z.enum(MOTIVOS_EGRESO_MANUAL, {
      error:
        'el motivo debe ser Merma, Ajuste o Devolución; los insumos de una orden de producción los descuenta la orden al finalizarse',
    }),
    observacion: z.string().trim().max(200).nullable().optional(),
    /** En una Devolución, la compra que se le devuelve al proveedor. */
    idNotaIngreso: z.number().int().positive().optional(),
    insumos: z.array(esquemaLineaInsumoEgreso).max(100).default([]),
    productos: z.array(esquemaLineaProductoEgreso).max(100).default([]),
  })
  .refine(alMenosUnaLinea, { message: MENSAJE_SIN_LINEAS, path: ['insumos'] })
  .refine((datos) => (datos.motivo === MOTIVO_DEVOLUCION) === (datos.idNotaIngreso !== undefined), {
    message: 'una devolución al proveedor indica la compra que devuelve, y solo una devolución la indica',
    path: ['idNotaIngreso'],
  });

export type DatosCrearIngreso = z.infer<typeof esquemaCrearIngreso>;
export type DatosCrearEgreso = z.infer<typeof esquemaCrearEgreso>;

export interface LineaMovimientoDTO {
  tipo: 'insumo' | 'producto';
  id: number;
  nombre: string;
  unidad: string;
  idAlmacen: number;
  almacen: string;
  cantidad: number;
  costoUnitario: number | null;
  subtotal: number | null;
  /**
   * El lote de vencimiento al que entró, en el ingreso de un perecedero. Nulo
   * en lo demás: la harina no lleva lote, y un egreso no dice a cuál afectó.
   */
  lote?: LoteDeVencimientoDTO | null;
}

export interface LoteDeVencimientoDTO {
  codigo: string | null;
  /** Fecha `AAAA-MM-DD`. */
  vencimiento: string;
  /** Lo que queda de ese lote en el almacén de la línea. */
  queda: number;
}

interface NotaBaseDTO {
  id: number;
  fecha: string;
  registradoPor: { id: number; nombreCompleto: string };
  lineas: LineaMovimientoDTO[];
}

export interface NotaIngresoDTO extends NotaBaseDTO {
  motivo: MotivoIngreso;
  proveedor: string | null;
  numeroDocumento: string | null;
  total: number;
  /** En una Reposición, la devolución al proveedor que repone. */
  idDevolucion: number | null;
}

export interface NotaEgresoDTO extends NotaBaseDTO {
  motivo: MotivoEgreso;
  observacion: string | null;
  /** En una Devolución, la compra que se le devolvió al proveedor. */
  idCompra: number | null;
}

/**
 * Una línea de una compra que todavía puede devolverse, o de una devolución
 * que falta reponer. Es lo que ofrece el formulario al elegir el documento:
 * la devolución sale de lo que entró en la compra, y la reposición repone lo
 * que salió en la devolución.
 */
export interface LineaVinculableDTO {
  tipo: 'insumo' | 'producto';
  id: number;
  nombre: string;
  unidad: string;
  idAlmacen: number;
  almacen: string;
  /** Lo que entró en la compra, o lo que salió en la devolución. */
  cantidad: number;
  /** Lo ya devuelto de esa compra, o lo ya repuesto de esa devolución. */
  vinculado: number;
  /** Lo que todavía se puede devolver, o lo que falta reponer. */
  pendiente: number;
  /**
   * Lo que hay hoy para devolver: lo que queda del lote de la compra, o del
   * ítem en su almacén. Nulo en una reposición, que no saca nada.
   */
  existencia: number | null;
  /** El precio de la compra, que es también el de su reposición. */
  costoUnitario: number;
  controlaVencimiento: boolean;
  /** En la compra de un perecedero, su lote: lo que se devuelve sale de él. */
  lote: LoteDeVencimientoDTO | null;
}

/** Una compra que puede devolverse, o una devolución que falta reponer. */
export interface DocumentoVinculableDTO {
  id: number;
  fecha: string;
  proveedor: string | null;
  numeroDocumento: string | null;
  /** En una devolución, la compra de la que salió. */
  idCompra: number | null;
  observacion: string | null;
  lineas: LineaVinculableDTO[];
}

/** Buscar por nombre del ítem y acotar a insumos o a productos. */
const camposDeItem = {
  termino: z.string().trim().max(100).optional(),
  tipo: z.enum(['insumo', 'producto']).optional(),
} as const;

/**
 * Filtros de listado de notas de ingreso. Con `termino` o `tipo`, solo las
 * notas que traen un ítem así: es la vista «por lote» de Inventario › Lotes,
 * donde cada nota es un lote con todo lo que entró junto.
 */
export const esquemaFiltroIngresos = z.object({
  motivo: z.enum(MOTIVOS_INGRESO).optional(),
  ...camposDeItem,
  ...camposDeFecha,
  ...camposDePagina,
});

/**
 * Inventario › Lotes, vista «por ítem»: cada línea de ingreso es un lote de
 * ese insumo o producto, con lo que costó la unidad en esa entrada.
 */
export const esquemaFiltroLotes = esquemaFiltroIngresos;
export type DatosFiltroLotes = z.infer<typeof esquemaFiltroLotes>;

/** Un lote: lo que entró de un ítem en una nota de ingreso. */
export interface LoteDeIngresoDTO {
  /** El número de lote es el de su nota de ingreso. */
  idNota: number;
  fecha: string;
  motivo: MotivoIngreso;
  proveedor: string | null;
  numeroDocumento: string | null;
  tipo: 'insumo' | 'producto';
  id: number;
  nombre: string;
  unidad: string;
  idAlmacen: number;
  almacen: string;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
  lote: LoteDeVencimientoDTO | null;
}

/**
 * Cómo varió el precio de un ítem entre sus lotes. Se arma cuando se busca
 * por nombre: es lo que responde «¿a cuánto compramos el aceite?».
 */
export interface ResumenLotesItemDTO {
  tipo: 'insumo' | 'producto';
  id: number;
  nombre: string;
  unidad: string;
  lotes: number;
  cantidad: number;
  costoMinimo: number;
  costoMaximo: number;
  /** El de la entrada más reciente. */
  costoUltimo: number;
  /** El que usa hoy el sistema: el del insumo o el promedio del producto. */
  costoActual: number | null;
}

export interface PaginaLotesDTO extends Pagina<LoteDeIngresoDTO> {
  /** Vacío si no se buscó por nombre. */
  resumen: ResumenLotesItemDTO[];
}
export const esquemaFiltroEgresos = z.object({
  motivo: z.enum(MOTIVOS_EGRESO).optional(),
  ...camposDeFecha,
  ...camposDePagina,
});
