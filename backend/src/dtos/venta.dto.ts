import { z } from 'zod';
import { camposDeFecha, camposDePagina } from './paginacion.dto.js';
import { METODOS_PAGO, TIPOS_VENTA, type MetodoPago, type TipoVenta } from '../config/dominio.js';
import type { PagoDTO } from '../services/pago.service.js';

/** Valores admitidos por `ck_venta_estado_pago`. */
export type EstadoPagoVenta = 'Pendiente' | 'Pagado' | 'Anulado';

/** CU-VEN-01 — Gestionar Venta. */

const esquemaLinea = z.object({
  idProducto: z.number().int().positive(),
  /** Los productos terminados se cuentan en unidades enteras. */
  cantidad: z.number().int().gt(0, 'la cantidad debe ser mayor a cero').max(1000),
});

/**
 * El precio no forma parte del cuerpo: lo toma el servidor de la tabla
 * `producto` al confirmar. Aceptarlo del cliente permitiría alterar el total.
 *
 * `idCliente` es opcional porque la ficha lo dice de forma explícita: si el
 * cliente está registrado la venta puede asociarse a su ficha, y si no, se
 * registra sin cliente. La columna del esquema es anulable.
 */
export const esquemaCrearVenta = z.object({
  tipoVenta: z.enum(TIPOS_VENTA).default('Mesa'),
  metodoPago: z.enum(METODOS_PAGO),
  idCliente: z.number().int().positive().nullable().optional(),
  items: z.array(esquemaLinea).min(1, 'la venta debe contener al menos un producto').max(50),
});

/**
 * Anulación de venta.
 *
 * El motivo es obligatorio: una venta anulada mueve stock y puede implicar
 * devolver dinero, de modo que tiene que quedar dicho por qué se hizo.
 */
export const esquemaAnularVenta = z.object({
  motivo: z.string().trim().min(4, 'indique el motivo de la anulación').max(200),
});

export const esquemaFiltroVentas = z.object({
  tipo: z.enum(TIPOS_VENTA).optional(),
  cliente: z.coerce.number().int().positive().optional(),
  ...camposDeFecha,
  ...camposDePagina,
});

export type DatosCrearVenta = z.infer<typeof esquemaCrearVenta>;
export type DatosAnularVenta = z.infer<typeof esquemaAnularVenta>;

export interface AnulacionVentaDTO {
  venta: VentaDTO;
  /** Verdadero cuando la venta estaba cobrada y hay dinero que devolver. */
  requiereDevolucion: boolean;
  aviso?: string;
}

export interface LineaVentaDTO {
  idProducto: number;
  nombre: string;
  almacen: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface VentaDTO {
  id: number;
  fecha: string;
  tipoVenta: TipoVenta;
  metodoPago: MetodoPago;
  /** Pendiente mientras el cobro en línea no haya sido confirmado. */
  estadoPago: EstadoPagoVenta;
  total: number;
  cliente: { id: number; nombreCompleto: string } | null;
  atendidoPor: { id: number; nombreCompleto: string };
  items: LineaVentaDTO[];
  /**
   * Cobro asociado. Lo llena el alta de la venta: en efectivo llega ya pagado
   * y en pago en línea trae el QR o el enlace que hay que mostrar al cliente.
   */
  cobro?: PagoDTO | null;
}

/**
 * RF-VEN-06 — comprobante de la venta.
 *
 * No hay tabla de comprobantes en el esquema, y es coherente: el comprobante no
 * agrega información, la presenta. Se genera a partir de la venta registrada,
 * igual que las alertas de stock se calculan al consultar.
 */
export interface ComprobanteDTO {
  numero: string;
  fecha: string;
  tipoVenta: TipoVenta;
  metodoPago: MetodoPago;
  cliente: string;
  atendidoPor: string;
  detalle: LineaVentaDTO[];
  cantidadItems: number;
  total: number;
}

/* ------------------------------------------------------------------ */
/* Producción al instante                                              */
/* ------------------------------------------------------------------ */

const esquemaItems = z
  .array(esquemaLinea)
  .min(1, 'la venta debe contener al menos un producto')
  .max(50);

/** Consulta previa: qué habría que producir para poder vender. */
export const esquemaEvaluarVenta = z.object({ items: esquemaItems });

/**
 * Venta que produce al instante lo que falte.
 *
 * El destino se indica **por producto**, no para toda la venta: dos productos
 * de la misma venta pueden ser uno refrigerado y otro seco, y un único almacén
 * no serviría para ambos. Solo hace falta indicarlo cuando hay más de un
 * almacén compatible con la conservación del producto; en el caso habitual el
 * sistema lo deduce.
 */
export const esquemaVentaConProduccion = esquemaCrearVenta.extend({
  destinos: z
    .array(
      z.object({
        idProducto: z.number().int().positive(),
        idAlmacen: z.number().int().positive(),
      }),
    )
    .max(50)
    .default([]),
});

export type DatosEvaluarVenta = z.infer<typeof esquemaEvaluarVenta>;
export type DatosVentaConProduccion = z.infer<typeof esquemaVentaConProduccion>;

export interface InsumoAConsumirDTO {
  idIngrediente: number;
  nombre: string;
  unidad: string;
  cantidadRequerida: number;
  costoUnitario: number;
}

export interface AlmacenDestinoDTO {
  id: number;
  nombre: string;
}

export interface LineaEvaluacionDTO {
  idProducto: number;
  nombre: string;
  solicitado: number;
  enStock: number;
  faltante: number;
  requiereProduccion: boolean;
  /** Falso cuando el producto no tiene receta activa y solo se vende de stock. */
  producible: boolean;
  motivo?: string;
  /** Puede superar al faltante si la receta no es divisible. */
  cantidadAProducir: number;
  excedente: number;
  insumos: InsumoAConsumirDTO[];
  costoProduccion: number;
  /** Almacenes que admiten la conservación del producto terminado. */
  almacenesCompatibles: AlmacenDestinoDTO[];
  /** Insumos que no alcanzan para esta línea por sí sola. */
  insumosFaltantes: InsumoFaltanteDTO[];
  /** Verdadero cuando hay más de uno y el vendedor debe elegir. */
  requiereElegirAlmacen: boolean;
}

export interface InsumoFaltanteDTO {
  nombre: string;
  unidad: string;
  requerido: number;
  disponible: number;
}

export interface EvaluacionVentaDTO {
  lineas: LineaEvaluacionDTO[];
  requiereProduccion: boolean;
  puedeVenderse: boolean;
  /**
   * Insumos que no alcanzan para el conjunto de la venta.
   *
   * No es la suma de los faltantes de cada línea: dos productos distintos
   * pueden compartir un insumo y ser producibles por separado pero no juntos.
   * Seis litros de leche alcanzan para cualquiera de los dos jugos, y no para
   * los dos.
   */
  insumosFaltantes: InsumoFaltanteDTO[];
}

export interface ProduccionRealizadaDTO {
  idOrden: number;
  idProducto: number;
  cantidadProducida: number;
  excedente: number;
  costoUnitario: number;
}

export interface VentaConProduccionDTO {
  venta: VentaDTO;
  producciones: ProduccionRealizadaDTO[];
}
