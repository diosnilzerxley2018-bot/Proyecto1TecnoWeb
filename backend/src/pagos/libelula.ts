import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import type { EstadoPago } from '../config/dominio.js';
import { ErrorApp } from '../errors/error-app.js';
import type {
  AvisoPasarela,
  CobroCreado,
  PasarelaPago,
  SolicitudCobro,
} from './pasarela.js';

/**
 * Adaptador para Libélula (Todotix), pasarela boliviana.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  ESTADO DE LA INTEGRACIÓN
 * ─────────────────────────────────────────────────────────────────────────
 * Los extremos y los nombres de los campos de **envío** están tomados de la
 * guía de integración pública de Libélula. Lo que sigue marcado como
 * **Verificado contra la API real** (septiembre de 2026): el registro de deuda
 * y los nombres de su respuesta. Queda marcado `CONFIRMAR` lo que no se pudo
 * comprobar sin la guía de integración: el contenido exacto del aviso de pago
 * y la consulta de estado, cuyo parámetro el servidor rechaza con todos los
 * nombres probados.
 *
 * `CONFIRMAR` son el detalle del aviso de pago,
 * que la guía describe en tablas que no pudieron leerse del PDF público.
 *
 * No están rellenados a ojo a propósito: un nombre de campo adivinado da la
 * falsa impresión de que la integración está terminada, y el error aparece
 * recién con dinero real de por medio. Al recibir las credenciales llegan
 * también la guía completa y un cobro de prueba; con eso se confirman en
 * minutos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  DIFERENCIA IMPORTANTE CON OTRAS PASARELAS
 * ─────────────────────────────────────────────────────────────────────────
 * Libélula **no firma criptográficamente** el aviso de pago. Llama a la
 * `callback_url` que se le indicó al registrar la deuda, y esa URL lleva un
 * identificador dentro. Es decir: el secreto es la propia dirección.
 *
 * Eso obliga a dos defensas que un aviso firmado no necesitaría:
 *
 *  1. La `callback_url` incluye un **testigo aleatorio por cobro**, imposible
 *     de adivinar y distinto del identificador del pago. Sin él, conocer el
 *     número de una venta bastaría para darla por pagada.
 *  2. El aviso **no se cree por sí solo**: solo dispara una consulta al propio
 *     Libélula. Quien decide si el cobro entró es la respuesta de la pasarela,
 *     no el cuerpo del aviso.
 */

const TIEMPO_LIMITE_MS = 15_000;

/**
 * Dirección de la API.
 *
 * `https://api.libelula.bo` confirmada por el soporte de Libélula por WhatsApp
 * el 23-sep-2026, preguntando expresamente cuál estaba vigente: la guía del
 * plugin indica esa y varias integraciones usan `api.todotix.com`, que también
 * responde. Se pregunta porque las dos funcionan y eso no aclara cuál seguirá
 * haciéndolo.
 *
 * No hay ambiente de pruebas: el mismo soporte respondió que **no cuentan con
 * uno para proyectos académicos**. El antiguo `todotix.com:10888` ya no
 * responde, y apuntar ahí por omisión solo hacía que todo fallara sin decir
 * por qué.
 */
const URL_BASE_OFICIAL = 'https://api.libelula.bo';

/** Traduce el vocabulario de la pasarela al del sistema. CONFIRMAR con la guía. */
/**
 * Desenlace del aviso, según lo que Libélula manda de verdad.
 *
 * El orden importa: primero la cancelación explícita, después el código de
 * error —«0» es el único éxito— y solo al final el campo `estado`, que su
 * plugin no usa pero que se admite por si alguna variante lo envía.
 */
function estadoDelAviso(datos: {
  error?: string | number;
  cancel_order?: string | number;
  estado?: string;
}): EstadoPago | undefined {
  if (String(datos.cancel_order ?? '') === '1') return 'Fallido';
  if (datos.error !== undefined) return String(datos.error) === '0' ? 'Pagado' : 'Fallido';
  return ESTADO_EQUIVALENTE[String(datos.estado ?? '').toUpperCase()];
}

const ESTADO_EQUIVALENTE: Record<string, EstadoPago> = {
  PENDIENTE: 'Pendiente',
  PAGADO: 'Pagado',
  COMPLETADO: 'Pagado',
  PROCESADO: 'Pagado',
  RECHAZADO: 'Fallido',
  FALLIDO: 'Fallido',
  EXPIRADO: 'Vencido',
  VENCIDO: 'Vencido',
  ANULADO: 'Reembolsado',
  REEMBOLSADO: 'Reembolsado',
};

/**
 * El testigo que autentica un aviso de pago.
 *
 * Se **deriva** de la referencia del cobro en lugar de guardarse. La primera
 * versión usaba un mapa en memoria, y eso falla justo cuando más importa: el
 * servidor se reinicia en cada despliegue, el mapa queda vacío, y los avisos
 * de los cobros abiertos antes del reinicio se rechazan por testigo
 * desconocido. El cliente paga, el dinero sale de su cuenta y el pedido se
 * queda esperando para siempre.
 *
 * Derivarlo con HMAC resuelve las dos cosas: no ocupa memoria y se puede
 * recalcular en cualquier momento, incluso en otro proceso. Lo que lo hace
 * infalsificable es que depende de `JWT_SECRET`, que solo conoce el servidor.
 */
function testigoDe(referencia: string): string {
  return createHmac('sha256', env.jwtSecret).update(referencia).digest('hex').slice(0, 32);
}

export class PasarelaLibelula implements PasarelaPago {
  readonly nombre = 'Libelula';
  readonly modo = 'Real' as const;

  /**
   * Sin credenciales no se puede cobrar, y fallar aquí con un mensaje claro es
   * mucho mejor que fallar más adelante con un 401 de un servidor ajeno.
   */
  private exigirCredenciales(): { urlBase: string; appkey: string } {
    const { urlBase, apiKey } = env.pago.libelula;
    if (!apiKey) {
      throw new ErrorApp(
        503,
        'El modo de cobro real está activo pero falta el appkey de Libélula. ' +
          'Configure LIBELULA_API_KEY, o vuelva al modo simulado.',
      );
    }
    return { urlBase: urlBase || URL_BASE_OFICIAL, appkey: apiKey };
  }

  private async pedir(ruta: string, cuerpo: Record<string, unknown>): Promise<unknown> {
    const { urlBase, appkey } = this.exigirCredenciales();

    const respuesta = await fetch(`${urlBase}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // El appkey viaja en el cuerpo, no en una cabecera de autorización.
      body: JSON.stringify({ appkey, ...cuerpo }),
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new ErrorApp(
        502,
        `La pasarela de pago respondió ${respuesta.status}. ${detalle.slice(0, 200)}`,
      );
    }
    return respuesta.json();
  }

  /**
   * Registra la deuda y devuelve la dirección donde el cliente paga.
   *
   * Libélula no entrega un código QR para dibujar: entrega una **página de
   * pago propia** donde el cliente elige entre sus canales —QR, tarjeta,
   * billetera— y donde el monto ya viene cargado. Por eso el tipo es `url`.
   */
  async crearCobro(solicitud: SolicitudCobro): Promise<CobroCreado> {
    const testigo = testigoDe(solicitud.referenciaInterna);
    const base = env.pago.urlPublica;

    if (!base) {
      throw new ErrorApp(
        503,
        'Falta PAGO_URL_PUBLICA: Libélula necesita una dirección pública a la que avisar ' +
          'cuando el cliente paga, y localhost no es alcanzable desde su servidor.',
      );
    }

    /*
     * Libélula rechaza el cobro sin correo, y en una venta a «Consumidor
     * final» no hay cliente de quien tomarlo. Se comprueba aquí para que el
     * fallo diga qué configurar, en vez de llegar como un «Debe especificar el
     * parámetro Email» que no señala a ninguna variable.
     */
    const correo = solicitud.cliente?.email || env.pago.libelula.emailComercio;
    if (!correo) {
      throw new ErrorApp(
        503,
        'Falta LIBELULA_EMAIL_COMERCIO: Libélula exige un correo en cada cobro, ' +
          'y esta venta no tiene cliente del que tomarlo.',
      );
    }

    const [nombre, ...apellido] = (solicitud.cliente?.nombre ?? '').split(' ');

    const cuerpo = {
      email_cliente: correo,
      identificador_deuda: solicitud.referenciaInterna,
      descripcion: solicitud.descripcion,
      // El testigo va dentro de la dirección: es lo que hace que el aviso no
      // pueda falsificarse conociendo solo el número de la venta.
      // La referencia viaja con el testigo porque es lo que permite
      // recalcularlo al recibir el aviso, sin haber guardado nada.
      callback_url:
        `${base}/api/pagos/notificacion` +
        `?testigo=${testigo}&ref=${encodeURIComponent(solicitud.referenciaInterna)}`,
      url_retorno: `${base}/ventas/registro`,
      nombre_cliente: nombre || 'Consumidor',
      apellido_cliente: apellido.join(' ') || 'Final',
      emite_factura: false,
      moneda: solicitud.moneda,
      lineas_detalle_deuda: [
        {
          concepto: solicitud.descripcion,
          cantidad: 1,
          costo_unitario: solicitud.monto,
        },
      ],
    };

    /*
     * Nombres verificados contra una respuesta real de `/rest/deuda/registrar`
     * (ambiente de pruebas, septiembre de 2026). La respuesta completa trae
     * además `codigo_recaudacion`, `qr_simple_url` y `monto_total`.
     */
    const datos = (await this.pedir('/rest/deuda/registrar', cuerpo)) as {
      id_transaccion?: string;
      /** Dirección de la pasarela. Es `url_pasarela_pagos`, no `url_pasarela`. */
      url_pasarela_pagos?: string;
      /** El QR ya dibujado, en PNG base64. Libélula lo genera por su cuenta. */
      qr_simple_base64?: string;
      codigo_recaudacion?: string;
      error?: number;
      mensaje?: string;
    };

    if (datos.error) {
      throw new ErrorApp(502, `Libélula rechazó el cobro: ${datos.mensaje ?? datos.error}`);
    }

    const idTransaccion = datos.id_transaccion;
    const urlPago = datos.url_pasarela_pagos;

    if (!idTransaccion || !urlPago) {
      throw new ErrorApp(
        502,
        'Libélula no devolvió el identificador de la transacción o la dirección de pago: ' +
          (datos.mensaje ?? 'respuesta inesperada'),
      );
    }

    /*
     * Lo que se le muestra al cliente depende de **cómo eligió pagar**.
     *
     * Libélula no registra «un pago con QR» o «un pago con tarjeta»: registra
     * una deuda, y devuelve siempre las dos formas de saldarla —el QR ya
     * dibujado y la dirección de su página, donde están todos los canales—.
     *
     * Preferir el QR sin mirar el método le daba un código para escanear a
     * quien había elegido Tarjeta, que es justo lo que esa persona no puede
     * usar. La tarjeta se cobra en la página de Libélula, que es la única que
     * puede pedir el número sin que pase por nosotros.
     */
    const codigoQR = solicitud.metodo === 'QR' ? datos.qr_simple_base64 : undefined;

    return {
      idTransaccionExterna: idTransaccion,
      datosCobro: codigoQR ? `data:image/png;base64,${codigoQR}` : urlPago,
      tipoDatos: codigoQR ? 'qr' : 'url',
      expiraEn: new Date(Date.now() + env.pago.minutosExpiracion * 60_000),
    };
  }

  /**
   * Comprueba el testigo de la dirección de aviso.
   *
   * No es una firma criptográfica —Libélula no las emite— sino la
   * comprobación de que quien avisa conoce la dirección secreta que solo se le
   * entregó a ella. Es la defensa que corresponde al mecanismo real.
   *
   * La comprobación definitiva no está aquí: el servicio vuelve a preguntarle
   * a Libélula antes de dar el cobro por bueno.
   */
  verificarFirma(_cuerpoCrudo: string, cabeceras: Record<string, string | undefined>): boolean {
    const testigo = cabeceras['x-testigo-pago'];
    const referencia = cabeceras['x-referencia-pago'];
    if (!testigo || !referencia) return false;

    const esperado = testigoDe(referencia);

    // Comparación de tiempo constante: comparar con `===` filtra cuántos
    // caracteres acertó quien lo intenta, y con eso se adivina uno a uno.
    const a = Buffer.from(testigo);
    const b = Buffer.from(esperado);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Traduce el aviso de Libélula.
   *
   * La forma está tomada de su propio plugin de WooCommerce (`woo.zip`,
   * `check_ipn_response`), que es la única descripción pública del contrato:
   * Libélula llama a la `callback_url` con `transaction_id`, `error`,
   * `message` y `cancel_order` **como parámetros de la dirección**, no como un
   * cuerpo JSON, y el éxito se señala con `error=0`.
   *
   * No hay campo `estado`: esperarlo hacía que todo aviso legítimo se
   * rechazara con «Estado de pago no reconocido: undefined». Se sigue
   * admitiendo por si alguna variante lo envía.
   */
  interpretarAviso(cuerpo: unknown): AvisoPasarela {
    const datos = cuerpo as {
      transaction_id?: string;
      id_transaccion?: string;
      /** «0» es éxito. Cualquier otro valor es un cobro que no se hizo. */
      error?: string | number;
      message?: string;
      /** «1» cuando el cliente abandonó el pago. */
      cancel_order?: string | number;
      estado?: string;
      /** Libélula lo llama `monto_total`; el resto se admite por compatibilidad. */
      monto_total?: number | string;
      monto?: number | string;
    };

    const id = datos.transaction_id ?? datos.id_transaccion ?? '';
    const monto = datos.monto_total ?? datos.monto;
    const estado = estadoDelAviso(datos);

    if (!estado) {
      throw new ErrorApp(
        400,
        'Aviso de pago no reconocido: no trae ni «error» ni «estado». ' +
          `Recibido: ${JSON.stringify(datos).slice(0, 200)}`,
      );
    }

    return {
      idTransaccionExterna: id,
      estado,
      // Solo si lo informó. Ausente ≠ cobrado cero.
      ...(monto === undefined ? {} : { monto: Number(monto) }),
    };
  }

  /**
   * Pregunta directamente por el estado del cobro.
   *
   * Es lo que decide si el dinero entró: el aviso solo dispara esta consulta.
   * CONFIRMAR la ruta y el nombre del campo de estado con la guía.
   */
  async consultarEstado(idTransaccionExterna: string): Promise<EstadoPago> {
    const datos = (await this.pedir('/rest/deuda/consultar', {
      id_transaccion: idTransaccionExterna,
    })) as { estado?: string };

    const estado = ESTADO_EQUIVALENTE[String(datos.estado ?? '').toUpperCase()];
    if (!estado) {
      throw new ErrorApp(502, `Estado de pago no reconocido: ${String(datos.estado)}`);
    }

    // Ya no hay nada que limpiar: el testigo se deriva, no se guarda.
    return estado;
  }
}
