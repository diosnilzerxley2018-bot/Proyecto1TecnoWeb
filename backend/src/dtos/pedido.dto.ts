import { z } from 'zod';
import { camposDeFecha, camposDePagina } from './paginacion.dto.js';
import { esquemaDestinoPedido } from './ubicacion.dto.js';
import type { PagoDTO } from '../services/pago.service.js';
import {
  ESTADOS_PEDIDO,
  METODOS_PAGO,
  type EstadoPedido,
  type MetodoPago,
} from '../config/dominio.js';

/** El vocabulario del pedido vive en la capa de dominio; aquí solo se usa. */
export type { EstadoPedido, MetodoPago };

/**
 * CU-PED-03 — Gestionar Ubicación.
 * La calle y la referencia son obligatorias; las coordenadas son opcionales y
 * se validan contra los rangos geográficos admitidos.
 */
const esquemaLinea = z.object({
  idProducto: z.number().int().positive(),
  cantidad: z.number().int().positive().max(100),
});

/**
 * CU-PED-02 — Gestionar Pedido.
 *
 * El precio no forma parte del cuerpo: lo toma el servidor de la tabla
 * `producto` en el momento de confirmar. Aceptarlo del cliente permitiría
 * alterar el total desde el navegador.
 *
 * CU-PED-04 — Pagar Pedido en Línea (extensión). La referencia de la
 * transacción **ya no se acepta del cliente**: la escribía él mismo en una caja
 * de texto y bastaban cuatro caracteres para dar un pedido por pagado. Ahora la
 * pone la pasarela al abrir el cobro, que es quien puede saberla.
 */
export const esquemaConfirmarPedido = z.object({
  metodoPago: z.enum(METODOS_PAGO),
  /**
   * CU-PED-03: una dirección guardada (`{ idUbicacion }`) o una escrita en el
   * momento. Las dos formas existen para que el cliente que vuelve confirme en
   * dos clics y el que pide por primera vez no tenga que guardar nada antes.
   */
  ubicacion: esquemaDestinoPedido,
  items: z.array(esquemaLinea).min(1).max(50),
});

export type DatosConfirmarPedido = z.infer<typeof esquemaConfirmarPedido>;

export interface UbicacionDTO {
  calle: string;
  numero: string | null;
  referencia: string | null;
  latitud: number | null;
  longitud: number | null;
}

export interface LineaPedidoDTO {
  idProducto: number;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface PedidoResumenDTO {
  id: number;
  fecha: string;
  estadoPedido: EstadoPedido;
  estadoPago: string;
  metodoPago: MetodoPago;
  total: number;
  fechaEntrega: string | null;
  cancelable: boolean;
}

export interface PedidoDetalleDTO extends PedidoResumenDTO {
  referenciaPago: string | null;
  /** Cobro asociado: trae el QR o el enlace que el cliente debe usar. */
  cobro?: PagoDTO | null;
  ubicacion: UbicacionDTO;
  items: LineaPedidoDTO[];
}

/* ------------------------------------------------------------------ */
/* CU-PED-02 — lado del empleado                                       */
/* ------------------------------------------------------------------ */

/** Filtro del tablero de pedidos del personal. */
export const esquemaFiltroPedidos = z.object({
  estado: z.enum(ESTADOS_PEDIDO).optional(),
  ...camposDeFecha,
  ...camposDePagina,
});

export type FiltroPedidos = z.infer<typeof esquemaFiltroPedidos>;

/**
 * RF-PED-08 — avance del estado.
 * El esquema acepta cualquier estado del vocabulario; que la transición sea
 * legítima lo decide la máquina de estados del dominio, no la validación de
 * entrada. Un cuerpo mal formado es 400; una transición prohibida es 409.
 */
export const esquemaCambiarEstado = z.object({
  estado: z.enum(ESTADOS_PEDIDO),
});

/** RF-PED-07 — asignación de repartidor. */
export const esquemaAsignarRepartidor = z.object({
  idRepartidor: z.number().int().positive(),
});

/** Quien lleva el pedido. No es un candidato: ya fue elegido. */
/** El repartidor declara si está de turno (RF-PED-07). */
export const esquemaDisponibilidad = z.object({ disponible: z.boolean() });

export interface RepartidorAsignadoDTO {
  id: number;
  nombreCompleto: string;
}

export interface RepartidorDTO {
  id: number;
  nombreCompleto: string;
  telefono: string | null;
  /** De turno o de franco. Solo se sugiere a quien está de turno. */
  disponible: boolean;
  /** Pedidos en preparación o en camino que ya tiene a su nombre. */
  entregasEnCurso: number;
}

/**
 * RF-PED-07 — a quién conviene asignarle el pedido.
 *
 * El sistema **sugiere**; asignar sigue siendo una acción de la persona. Por
 * eso vienen los dos: el sugerido y la lista completa para cambiarlo.
 */
export interface SugerenciaRepartidorDTO {
  /** Nulo cuando no hay nadie de turno. No es un error: es una situación normal. */
  sugerido: RepartidorDTO | null;
  /** Por qué es ese, o por qué no hay ninguno. Se le muestra a quien decide. */
  motivo: string;
  candidatos: RepartidorDTO[];
}

/**
 * Vista del pedido para el personal: agrega a quién entregar y quién reparte,
 * datos que el portal del cliente no necesita.
 */
export interface PedidoGestionDTO extends PedidoDetalleDTO {
  cliente: { id: number; nombreCompleto: string; telefono: string | null };
  repartidor: RepartidorAsignadoDTO | null;
  transicionesPosibles: EstadoPedido[];
}
