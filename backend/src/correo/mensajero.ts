/**
 * Contrato del envío de correo.
 *
 * Existe por la misma razón que `PasarelaPago`: el resto del sistema pide
 * "avisale a esta persona" y no sabe —ni debe saber— si detrás hay un servidor
 * SMTP, un registro en el log o una casilla en memoria.
 *
 * Es lo que permite que las 282 pruebas corran sin un servidor de correo, y
 * que la misma aplicación funcione en la máquina de desarrollo y en la VM del
 * laboratorio cambiando una variable de entorno.
 */

export interface Mensaje {
  /**
   * Destinatarios.
   *
   * Es una lista y no una dirección suelta porque un reporte se manda **a
   * quien lo necesita**, y eso suele ser más de una persona: gerencia y
   * contabilidad quieren el mismo cierre de ventas. Los avisos de pedido
   * siguen llevando un solo destinatario —son personales—, pero el contrato
   * es uno solo para no tener dos formas de enviar.
   */
  para: string[];
  asunto: string;
  /** Cuerpo en texto plano. Es el que se lee si el cliente bloquea el HTML. */
  texto: string;
  /** Cuerpo en HTML. Opcional: sin él se envía solo el texto. */
  html?: string;
  adjuntos?: Adjunto[];
}

export interface Adjunto {
  nombre: string;
  contenido: Buffer;
  /** Tipo MIME. Por ejemplo `application/pdf`. */
  tipo: string;
}

export interface ResultadoEnvio {
  enviado: boolean;
  /** Identificador que devolvió el servidor, para rastrear un reclamo. */
  referencia: string | null;
  /** Por qué no se envió. Nulo cuando salió bien. */
  motivo?: string;
}

export interface Mensajero {
  readonly nombre: string;
  /** Verdadero cuando los mensajes salen de verdad. */
  readonly enviaDeVerdad: boolean;
  enviar(mensaje: Mensaje): Promise<ResultadoEnvio>;
}
