import { z } from 'zod';
import { ESTADOS_PEDIDO } from '../config/dominio.js';

/**
 * RF-VEN-07 — reporte parametrizado de ventas por rango de fechas y producto,
 * exportable a PDF y enviable por correo electrónico.
 */

/** Tope del rango. Un reporte de años no se lee: se consulta en pantalla. */
const MAXIMO_DIAS = 366;

/**
 * Las dos reglas del rango, compartidas por los cuatro reportes.
 *
 * Se extraen las **comprobaciones** y no el constructor del esquema: envolver
 * el esquema en un ayudante genérico hacía que Zod perdiera el tipo de los
 * campos, y la comprobación quedaba a ciegas. Así la regla vive en un solo
 * lugar y cada esquema conserva sus tipos.
 */
const rangoOrdenado = (f: { desde: string; hasta: string }) =>
  new Date(f.desde) <= new Date(f.hasta);

const rangoAcotado = (f: { desde: string; hasta: string }) =>
  (new Date(f.hasta).getTime() - new Date(f.desde).getTime()) / 86_400_000 <= MAXIMO_DIAS;

const MENSAJE_ORDEN = {
  message: 'La fecha inicial no puede ser posterior a la final',
  path: ['desde'],
};
const MENSAJE_TOPE = {
  message: `El rango no puede superar ${MAXIMO_DIAS} días`,
  path: ['hasta'],
};

export const esquemaReporteVentas = z
  .object({
    desde: z.iso.date(),
    hasta: z.iso.date(),
    /** Un producto concreto, o todos si se omite. */
    idProducto: z.coerce.number().int().positive().optional(),
  })
  .refine(rangoOrdenado, MENSAJE_ORDEN)
  .refine(rangoAcotado, MENSAJE_TOPE);

/**
 * Destinatarios de un reporte: **uno o varios**.
 *
 * El requisito lo pide así, y tiene sentido de negocio: un cierre de ventas lo
 * quieren gerencia y contabilidad a la vez, y obligar a repetir el envío haría
 * que cada quien reciba un PDF distinto si alguien registró algo entre los dos
 * clics.
 *
 * Se admite una cadena con las direcciones separadas por coma —que es como se
 * escriben en un campo de texto— o una lista ya formada, y se normaliza a
 * lista. Aceptar solo una de las dos formas obligaría a la interfaz a conocer
 * un detalle del contrato que no le aporta nada.
 */
const TOPE_DESTINATARIOS = 5;

export const destinatariosDeReporte = z
  .union([z.string(), z.array(z.string())])
  .transform((valor) =>
    (Array.isArray(valor) ? valor : valor.split(','))
      .map((c) => c.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(z.email('indique correos válidos'))
      .min(1, 'indique al menos un destinatario')
      // Un tope, porque el reporte lleva un PDF y la cuota de envío es
      // limitada: sin él, un envío puede agotarla para todo el día.
      .max(TOPE_DESTINATARIOS, `No se puede enviar a más de ${TOPE_DESTINATARIOS} correos`),
  );

/** Envío por correo: el mismo reporte, con sus destinatarios. */
export const esquemaEnviarReporte = z.object({
  desde: z.iso.date(),
  hasta: z.iso.date(),
  idProducto: z.coerce.number().int().positive().optional(),
  para: destinatariosDeReporte,
});

export type DatosReporteVentas = z.infer<typeof esquemaReporteVentas>;
export type DatosEnviarReporte = z.infer<typeof esquemaEnviarReporte>;

export interface LineaProductoReporteDTO {
  idProducto: number;
  nombre: string;
  unidades: number;
  importe: number;
  /** Porcentaje del importe total. Es lo que responde "qué se vende". */
  participacion: number;
}

export interface ResumenReporteDTO {
  cantidadVentas: number;
  unidades: number;
  total: number;
  /** Promedio por venta. Dice más del negocio que el total solo. */
  ticketPromedio: number;
}

export interface ReporteVentasDTO {
  /** Rango y filtro con los que se generó, para que el PDF se explique solo. */
  desde: string;
  hasta: string;
  producto: string | null;
  generadoEn: string;
  resumen: ResumenReporteDTO;
  /** Productos ordenados por importe, del que más vendió al que menos. */
  porProducto: LineaProductoReporteDTO[];
  porMetodoPago: { metodo: string; cantidadVentas: number; total: number }[];
  porDia: { dia: string; cantidadVentas: number; total: number }[];
}

/* ------------------------------------------------------------------ */
/* RF-PED-10 — pedidos                                                 */
/* ------------------------------------------------------------------ */

const rango = {
  desde: z.iso.date(),
  hasta: z.iso.date(),
} as const;

export const esquemaReportePedidos = z
  .object({
    ...rango,
    estado: z.enum(ESTADOS_PEDIDO).optional(),
    idRepartidor: z.coerce.number().int().positive().optional(),
  })
  .refine(rangoOrdenado, MENSAJE_ORDEN)
  .refine(rangoAcotado, MENSAJE_TOPE);

export interface LineaPedidoReporteDTO {
  id: number;
  fecha: string;
  estado: string;
  metodoPago: string;
  total: number;
  repartidor: string | null;
  /** Minutos entre la confirmación y la entrega. Nulo si aún no se entregó. */
  minutosDeEntrega: number | null;
}

export interface ReportePedidosDTO {
  desde: string;
  hasta: string;
  estado: string | null;
  repartidor: string | null;
  generadoEn: string;
  resumen: {
    cantidadPedidos: number;
    entregados: number;
    cancelados: number;
    total: number;
    /** Promedio de los entregados. Nulo si ninguno se entregó todavía. */
    minutosPromedio: number | null;
  };
  porEstado: { estado: string; cantidad: number; total: number }[];
  porRepartidor: {
    repartidor: string;
    entregas: number;
    minutosPromedio: number | null;
  }[];
  pedidos: LineaPedidoReporteDTO[];
}

/* ------------------------------------------------------------------ */
/* RF-PRO-08 — producción                                              */
/* ------------------------------------------------------------------ */

export const esquemaReporteProduccion = z
  .object({ ...rango, idProducto: z.coerce.number().int().positive().optional() })
  .refine(rangoOrdenado, MENSAJE_ORDEN)
  .refine(rangoAcotado, MENSAJE_TOPE);

export interface LineaCorridaDTO {
  idOrden: number;
  fecha: string;
  producto: string;
  receta: string;
  /** Lo obtenido, no lo planificado: es lo que de verdad entró al almacén. */
  cantidad: number;
  /** Planificado menos obtenido, cuando salió de menos (hallazgo H10). */
  merma: number;
  /** Verdadero si se produjo al instante para una venta de mostrador. */
  instantanea: boolean;
  costo: number;
  costoUnitario: number;
}

export interface ReporteProduccionDTO {
  desde: string;
  hasta: string;
  producto: string | null;
  generadoEn: string;
  resumen: {
    corridas: number;
    /** Unidades obtenidas. */
    unidades: number;
    /** Unidades perdidas en el período. Es la pregunta que responde H10. */
    merma: number;
    costoTotal: number;
    costoUnitarioPromedio: number;
  };
  porProducto: { producto: string; corridas: number; unidades: number; costo: number }[];
  insumosConsumidos: { insumo: string; unidad: string; cantidad: number; costo: number }[];
  corridas: LineaCorridaDTO[];
}

/* ------------------------------------------------------------------ */
/* RF-INV-08 — movimientos de inventario                               */
/* ------------------------------------------------------------------ */

export const esquemaReporteInventario = z
  .object({
    ...rango,
    idIngrediente: z.coerce.number().int().positive().optional(),
    idProducto: z.coerce.number().int().positive().optional(),
  })
  .refine(rangoOrdenado, MENSAJE_ORDEN)
  .refine(rangoAcotado, MENSAJE_TOPE);

export interface LineaMovimientoReporteDTO {
  fecha: string;
  tipo: 'Ingreso' | 'Egreso';
  motivo: string;
  item: string;
  unidad: string;
  cantidad: number;
  /** Nulo en los egresos: una salida no tiene costo propio. */
  costo: number | null;
}

export interface ReporteInventarioDTO {
  desde: string;
  hasta: string;
  filtro: string | null;
  generadoEn: string;
  resumen: {
    ingresos: number;
    egresos: number;
    costoIngresado: number;
  };
  porItem: {
    item: string;
    unidad: string;
    entradas: number;
    salidas: number;
    /** Entradas menos salidas. Negativo significa que se consumió más de lo que entró. */
    neto: number;
  }[];
  movimientos: LineaMovimientoReporteDTO[];
}

/**
 * Envío por correo de los reportes de operaciones.
 *
 * Solo comprueba el destinatario y **deja pasar el resto del cuerpo**: los
 * filtros de cada reporte los valida su propio esquema en el controlador. Un
 * `z.object` normal los descartaría al recortar, y el correo llegaría con un
 * reporte sin filtrar.
 */
export const esquemaDestinatarioReporte = z.looseObject({
  para: destinatariosDeReporte,
});

export type DatosReportePedidos = z.infer<typeof esquemaReportePedidos>;
export type DatosReporteProduccion = z.infer<typeof esquemaReporteProduccion>;
export type DatosReporteInventario = z.infer<typeof esquemaReporteInventario>;
