import { z } from 'zod';
import { cantidadDeInsumo } from './cantidad.dto.js';
import { camposDeFecha, camposDePagina } from './paginacion.dto.js';
import {
  MOTIVOS_EGRESO,
  MOTIVOS_INGRESO,
  type MotivoEgreso,
  type MotivoIngreso,
} from '../config/dominio.js';

/**
 * CU-INV-03 Gestionar Ingreso y CU-INV-04 Gestionar Egreso.
 *
 * Ambas notas admiten insumos, productos terminados o ambos, por eso el cuerpo
 * lleva dos listas separadas. Los tipos de cantidad difieren porque así los
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

export const esquemaCrearIngreso = z
  .object({
    motivo: z.enum(MOTIVOS_INGRESO).default('Compra'),
    proveedor: z.string().trim().max(150).nullable().optional(),
    numeroDocumento: z.string().trim().max(50).nullable().optional(),
    insumos: z.array(esquemaLineaInsumoIngreso).max(100).default([]),
    productos: z.array(esquemaLineaProductoIngreso).max(100).default([]),
  })
  .refine(alMenosUnaLinea, { message: MENSAJE_SIN_LINEAS, path: ['insumos'] });

export const esquemaCrearEgreso = z
  .object({
    motivo: z.enum(MOTIVOS_EGRESO),
    observacion: z.string().trim().max(200).nullable().optional(),
    insumos: z.array(esquemaLineaInsumoEgreso).max(100).default([]),
    productos: z.array(esquemaLineaProductoEgreso).max(100).default([]),
  })
  .refine(alMenosUnaLinea, { message: MENSAJE_SIN_LINEAS, path: ['insumos'] });

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
}

export interface NotaEgresoDTO extends NotaBaseDTO {
  motivo: MotivoEgreso;
  observacion: string | null;
}

/** Filtros de listado de notas. */
export const esquemaFiltroIngresos = z.object({
  motivo: z.enum(MOTIVOS_INGRESO).optional(),
  ...camposDeFecha,
  ...camposDePagina,
});
export const esquemaFiltroEgresos = z.object({
  motivo: z.enum(MOTIVOS_EGRESO).optional(),
  ...camposDeFecha,
  ...camposDePagina,
});
