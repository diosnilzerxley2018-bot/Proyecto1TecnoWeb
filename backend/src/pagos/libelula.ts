import { randomUUID } from 'node:crypto';
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

/** Extremos publicados en la guía de integración. */
const EXTREMOS = {
  produccion: 'https://api.todotix.com',
  pruebas: 'http://www.todotix.com:10888',
} as const;

/** Traduce el vocabulario de la pasarela al del sistema. CONFIRMAR con la guía. */
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
 * Testigos vigentes, por cobro.
 *
 * Viven en memoria porque solo hacen falta entre que se abre el cobro y que
 * llega el aviso. Si el proceso se reinicia en ese lapso, el aviso se ignora y
 * el cobro se resuelve igual por consulta directa, que es la red de seguridad
 * de todo el diseño.
 */
const testigos = new Map<string, string>();

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
    // Sin URL explícita se asume el ambiente de pruebas: equivocarse hacia el
    // lado que no mueve dinero es la falla segura.
    return { urlBase: urlBase || EXTREMOS.pruebas, appkey: apiKey };
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
    const testigo = randomUUID();
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
      callback_url: `${base}/api/pagos/notificacion?testigo=${testigo}`,
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

    testigos.set(idTransaccion, testigo);

    /*
     * Libélula devuelve el QR ya dibujado, así que se prefiere sobre la
     * dirección: el cliente escanea desde la app de su banco sin salir del
     * sistema. La dirección queda como respaldo para quien pague con tarjeta,
     * que es lo que esa pantalla ofrece.
     */
    return {
      idTransaccionExterna: idTransaccion,
      datosCobro: datos.qr_simple_base64
        ? `data:image/png;base64,${datos.qr_simple_base64}`
        : urlPago,
      tipoDatos: datos.qr_simple_base64 ? 'qr' : 'url',
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
    if (!testigo) return false;
    return [...testigos.values()].includes(testigo);
  }

  interpretarAviso(cuerpo: unknown): AvisoPasarela {
    const datos = cuerpo as {
      // CONFIRMAR: qué envía Libélula en el aviso.
      transaction_id?: string;
      id_transaccion?: string;
      estado?: string;
      monto?: number | string;
    };

    const id = datos.transaction_id ?? datos.id_transaccion ?? '';
    const estado = ESTADO_EQUIVALENTE[String(datos.estado ?? '').toUpperCase()];

    if (!estado) {
      throw new ErrorApp(400, `Estado de pago no reconocido: ${String(datos.estado)}`);
    }

    return { idTransaccionExterna: id, estado, monto: Number(datos.monto ?? 0) };
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

    if (estado !== 'Pendiente') testigos.delete(idTransaccionExterna);
    return estado;
  }
}
