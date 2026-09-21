/**
 * Reglas de dominio que no pertenecen a ninguna capa técnica.
 *
 * El modelo de clases define Usuario como supertipo, con Empleado y Cliente
 * como especializaciones. Todo usuario debe materializarse en exactamente una
 * de las dos tablas de subtipo; de lo contrario no puede participar en ventas,
 * pedidos, notas de inventario ni órdenes de producción, porque siete claves
 * foráneas del esquema apuntan a `empleado` o a `cliente`.
 */

/** Rol que identifica a un actor externo del portal de pedidos. */
export const ROL_CLIENTE = 'Cliente';

/** Un usuario es personal interno cuando su rol no es el de cliente. */
export function esPersonalInterno(nombreRol: string): boolean {
  return nombreRol !== ROL_CLIENTE;
}

/**
 * Único cargo habilitado para repartir pedidos.
 * CU-PED-02, excepciones: "Solo pueden asignarse como repartidores los
 * empleados con cargo Repartidor."
 */
export const CARGO_REPARTIDOR = 'Repartidor';

/* ------------------------------------------------------------------ */
/* Ciclo de vida del pedido                                            */
/* ------------------------------------------------------------------ */

/** Valores admitidos por la restricción `ck_pedido_estado` del esquema. */
export const ESTADOS_PEDIDO = [
  // Reserva el stock mientras se espera la confirmación de la pasarela. Un
  // pedido en línea no entra a la cocina antes de que el dinero esté.
  'Pendiente de pago',
  'Recibido',
  'En preparacion',
  'En camino',
  'Entregado',
  'Cancelado',
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

/** Valores admitidos por la restricción `ck_pedido_metodo` del esquema. */
export const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'QR'] as const;

export type MetodoPago = (typeof METODOS_PAGO)[number];

/**
 * Flujo de estados que puede hacer avanzar el empleado (RF-PED-08):
 * recibido → en preparación → en camino → entregado.
 *
 * Se declara como tabla de transiciones en lugar de encadenar condicionales:
 * la regla queda legible de un vistazo y no se puede saltar un paso.
 * La cancelación no figura aquí porque es otro caso de uso —CU-PED-05—, la
 * ejecuta el cliente y además repone stock.
 */
export const FLUJO_DE_ESTADOS: Record<EstadoPedido, EstadoPedido[]> = {
  // No lo hace avanzar el empleado sino el cobro: sale de aquí cuando la
  // pasarela confirma, o se cancela si el plazo vence.
  'Pendiente de pago': [],
  Recibido: ['En preparacion'],
  'En preparacion': ['En camino'],
  /**
   * Un pedido en la calle termina de dos maneras, y las dos son finales: se
   * entrega, o no se pudo entregar —no había nadie en la dirección— y vuelve.
   * La segunda reutiliza `Cancelado` en lugar de un estado propio: para el
   * negocio la consecuencia es la misma, el pedido no se cobró y la comida
   * regresa al inventario.
   */
  'En camino': ['Entregado', 'Cancelado'],
  Entregado: [],
  Cancelado: [],
};

/**
 * Estados en los que el cliente todavía puede cancelar (CU-PED-05):
 * mientras el pedido no haya salido a reparto.
 */
export const ESTADOS_CANCELABLES: EstadoPedido[] = [
  'Pendiente de pago',
  'Recibido',
  'En preparacion',
];

/** Estado al que se puede pasar desde `origen`, o lista vacía si es terminal. */
export function transicionesPosibles(origen: EstadoPedido): EstadoPedido[] {
  return FLUJO_DE_ESTADOS[origen];
}

export function esTransicionValida(origen: EstadoPedido, destino: EstadoPedido): boolean {
  return FLUJO_DE_ESTADOS[origen].includes(destino);
}

/**
 * Estados en los que un pedido **ocupa** a su repartidor.
 *
 * Es la base del reparto equitativo: la carga de cada repartidor es cuántos
 * pedidos tiene en estos estados. Un pedido entregado o cancelado ya no ocupa
 * a nadie, aunque siga asignado a su nombre en el historial.
 */
export const ESTADOS_OCUPAN_REPARTIDOR: EstadoPedido[] = ['En preparacion', 'En camino'];

export function esCancelable(estado: EstadoPedido): boolean {
  return ESTADOS_CANCELABLES.includes(estado);
}

/* ------------------------------------------------------------------ */
/* Inventario                                                          */
/* ------------------------------------------------------------------ */

/**
 * Valores admitidos por la restricción `ck_almacen_tipo` del esquema.
 *
 * CU-INV-02: "El tipo de conservación determina qué insumos y productos pueden
 * almacenarse en cada almacén. Al no existir traspasos entre almacenes, cada
 * insumo y producto permanece en el almacén que corresponde a su condición."
 */
export const TIPOS_CONSERVACION = ['Seco', 'Refrigerado'] as const;

export type TipoConservacion = (typeof TIPOS_CONSERVACION)[number];

/**
 * Motivos admitidos por `ck_notaing_motivo` y `ck_notaegr_motivo`.
 *
 * Las listas no coinciden, y la diferencia es deliberada: no existe el motivo
 * "Venta" ni "Pedido" porque esas salidas ya quedan documentadas por el
 * detalle de la venta o del pedido, que registra el almacén de origen. La nota
 * de egreso documenta las salidas que no tienen otro respaldo.
 */
export const MOTIVOS_INGRESO = ['Compra', 'Produccion', 'Ajuste', 'Devolucion'] as const;
export const MOTIVOS_EGRESO = ['Produccion', 'Merma', 'Ajuste'] as const;

export type MotivoIngreso = (typeof MOTIVOS_INGRESO)[number];
export type MotivoEgreso = (typeof MOTIVOS_EGRESO)[number];

/* ------------------------------------------------------------------ */
/* Ciclo de vida de la orden de producción                             */
/* ------------------------------------------------------------------ */

/** Valores admitidos por la restricción `ck_ordprod_estado` del esquema. */
export const ESTADOS_ORDEN = ['Pendiente', 'En proceso', 'Finalizada', 'Cancelada'] as const;

export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];

/**
 * CU-PRO-02: "El estado de la orden evoluciona según el flujo: Pendiente, En
 * proceso y Finalizada."
 *
 * La cancelación no figura en la tabla porque es otro caso de uso —CU-PRO-04,
 * que extiende a este— y tiene su propia condición.
 */
export const FLUJO_ORDEN: Record<EstadoOrden, EstadoOrden[]> = {
  Pendiente: ['En proceso'],
  'En proceso': ['Finalizada'],
  Finalizada: [],
  Cancelada: [],
};

/**
 * CU-PRO-04: el empleado puede cancelar una orden mientras se encuentre en
 * estado Pendiente o En proceso.
 */
export const ESTADOS_ORDEN_CANCELABLES: EstadoOrden[] = ['Pendiente', 'En proceso'];

export function transicionesDeOrden(origen: EstadoOrden): EstadoOrden[] {
  return FLUJO_ORDEN[origen];
}

export function esOrdenCancelable(estado: EstadoOrden): boolean {
  return ESTADOS_ORDEN_CANCELABLES.includes(estado);
}

/* ------------------------------------------------------------------ */
/* Venta en el local                                                   */
/* ------------------------------------------------------------------ */

/** Valores admitidos por la restricción `ck_venta_tipo` del esquema. */
export const TIPOS_VENTA = ['Mesa', 'Llevar'] as const;

export type TipoVenta = (typeof TIPOS_VENTA)[number];

/* ------------------------------------------------------------------ */
/* Cobros (RF-PED-04)                                                  */
/* ------------------------------------------------------------------ */

/**
 * Modo de cobro del sistema, guardado en `configuracion.MODO_COBRO`.
 *
 * `Simulado` no mueve dinero: sirve para desarrollo, para la demostración y
 * para operar mientras no haya contrato con una pasarela. `Real` cobra de
 * verdad. Cada cobro guarda el modo con el que nació, de modo que la
 * recaudación verdadera nunca se confunde con la de las pruebas.
 */
export const MODOS_COBRO = ['Simulado', 'Real'] as const;
export type ModoCobro = (typeof MODOS_COBRO)[number];

/** Valores admitidos por `ck_pago_estado`. */
export const ESTADOS_PAGO = ['Pendiente', 'Pagado', 'Fallido', 'Vencido', 'Reembolsado'] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];

/** Un cobro terminado ya no cambia por un aviso tardío de la pasarela. */
export const ESTADOS_PAGO_FINALES: EstadoPago[] = ['Pagado', 'Fallido', 'Vencido', 'Reembolsado'];

export function esPagoFinal(estado: EstadoPago): boolean {
  return ESTADOS_PAGO_FINALES.includes(estado);
}

/** El efectivo no pasa por pasarela: se cobra en el mostrador. */
export function requiereCobroEnLinea(metodoPago: MetodoPago): boolean {
  return metodoPago !== 'Efectivo';
}

export const ORIGENES_EVENTO_PAGO = ['Pasarela', 'Sistema', 'Empleado'] as const;
export type OrigenEventoPago = (typeof ORIGENES_EVENTO_PAGO)[number];
