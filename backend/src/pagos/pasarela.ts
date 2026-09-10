import type { EstadoPago, MetodoPago, ModoCobro } from '../config/dominio.js';

/**
 * Contrato que debe cumplir toda pasarela de cobro.
 *
 * Existe para que el resto del sistema no sepa **con quién** se cobra. El
 * servicio de pagos habla siempre contra esta interfaz; cambiar de Libélula a
 * PagosNet, o de simulado a real, es cambiar qué objeto se devuelve en
 * `pasarelaVigente()` y nada más.
 *
 * Es también lo que hace posible el requisito del administrador: el modo de
 * cobro se cambia en caliente porque ambos modos implementan el mismo
 * contrato, no porque haya un `if` repartido por los servicios.
 */

export interface SolicitudCobro {
  monto: number;
  moneda: string;
  metodo: MetodoPago;
  descripcion: string;
  /** Referencia del lado de NutriExpress: `VENTA-128`, `PEDIDO-45`. */
  referenciaInterna: string;
  cliente?: { nombre: string; email?: string };
}

export interface CobroCreado {
  /** Identificador del lado de la pasarela. Es la clave de la idempotencia. */
  idTransaccionExterna: string;
  /**
   * Lo que hay que mostrarle al cliente: el contenido del código QR, o la
   * dirección del checkout alojado donde ingresa los datos de su tarjeta.
   */
  datosCobro: string;
  tipoDatos: 'qr' | 'url';
  expiraEn: Date;
}

/** Lo que una pasarela nos comunica sobre un cobro, ya interpretado. */
export interface AvisoPasarela {
  idTransaccionExterna: string;
  estado: EstadoPago;
  /** Monto que la pasarela dice haber cobrado, para contrastarlo con el nuestro. */
  monto: number;
}

export interface PasarelaPago {
  readonly nombre: string;
  readonly modo: ModoCobro;

  crearCobro(solicitud: SolicitudCobro): Promise<CobroCreado>;

  /**
   * Comprueba que el aviso venga realmente de la pasarela.
   *
   * El endpoint que recibe los avisos es público —tiene que serlo, lo llama
   * un servidor ajeno que no puede iniciar sesión—, de modo que sin esta
   * verificación cualquiera podría marcar pedidos como pagados con un `curl`.
   */
  verificarFirma(cuerpoCrudo: string, cabeceras: Record<string, string | undefined>): boolean;

  /** Traduce el cuerpo del aviso al vocabulario del sistema. */
  interpretarAviso(cuerpo: unknown): AvisoPasarela;

  /**
   * Pregunta directamente por el estado de un cobro.
   *
   * Es la red de seguridad de todo el diseño: los avisos se pierden —el
   * servidor estaba caído, la red falló, el aviso nunca salió—, y un cobro que
   * solo se entera por aviso se queda pendiente para siempre. Con esto, el
   * sistema puede preguntar en lugar de esperar.
   */
  consultarEstado(idTransaccionExterna: string): Promise<EstadoPago>;
}
