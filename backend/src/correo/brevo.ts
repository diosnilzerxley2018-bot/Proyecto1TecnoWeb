import { env } from '../config/env.js';
import type { Mensaje, Mensajero, ResultadoEnvio } from './mensajero.js';

/**
 * Mensajero real — entrega por la API HTTPS de Brevo.
 *
 * Existe porque **el puerto SMTP no siempre está disponible**: las plataformas
 * gestionadas —Railway entre ellas— lo bloquean en sus planes básicos para
 * frenar el spam, de modo que `MensajeroSmtp` no puede conectarse por más bien
 * configurado que esté. El tráfico HTTPS sí sale, y por ahí va este.
 *
 * Brevo **no es un servidor de correo**: envía en nombre del sistema, pero no
 * recibe ni guarda buzones. El servidor de correo del proyecto sigue siendo el
 * del laboratorio (Postfix + Dovecot + BIND9); esto es lo que hace que el
 * despliegue público pueda avisar a un cliente real.
 */

const URL_ENVIO = 'https://api.brevo.com/v3/smtp/email';

/** Un aviso que tarda más que esto ya no le sirve a nadie. */
const TIEMPO_MAXIMO_MS = 10_000;

/**
 * Separa `Nombre <correo@dominio>` en sus dos partes.
 *
 * La API pide el nombre y la dirección en campos distintos, mientras que el
 * resto del sistema —y el SMTP— usan la forma de una sola línea. Se traduce
 * aquí para que `CORREO_REMITENTE` se escriba igual sea cual sea el mensajero.
 */
function separarRemitente(remitente: string): { name?: string; email: string } {
  const conNombre = remitente.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!conNombre) return { email: remitente.trim() };

  const nombre = conNombre[1].replace(/^["']|["']$/g, '').trim();
  return nombre ? { name: nombre, email: conNombre[2].trim() } : { email: conNombre[2].trim() };
}

interface RespuestaBrevo {
  messageId?: string;
  /** Presente cuando algo falla. */
  message?: string;
  code?: string;
}

export class MensajeroBrevo implements Mensajero {
  readonly nombre = 'Brevo';
  readonly enviaDeVerdad = true;

  /**
   * Envía, y **nunca lanza**.
   *
   * Igual que el mensajero SMTP: un aviso es un accesorio de la operación, no
   * su propósito. Que el correo falle no puede hacer que un pedido no se
   * registre.
   */
  async enviar(mensaje: Mensaje): Promise<ResultadoEnvio> {
    if (!env.correo.brevoApiKey) {
      const motivo = 'Falta BREVO_API_KEY: no se puede enviar por Brevo';
      console.error(`[correo] ${motivo}`);
      return { enviado: false, referencia: null, motivo };
    }

    // Corta la espera por su cuenta: `fetch` no tiene tiempo máximo propio y
    // una petición colgada dejaría el aviso esperando indefinidamente.
    const reloj = AbortSignal.timeout(TIEMPO_MAXIMO_MS);

    try {
      const respuesta = await fetch(URL_ENVIO, {
        method: 'POST',
        headers: {
          'api-key': env.correo.brevoApiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        signal: reloj,
        body: JSON.stringify({
          sender: separarRemitente(env.correo.remitente),
          // La API recibe la lista completa: un solo envío con varios `To`.
          to: mensaje.para.map((email) => ({ email })),
          subject: mensaje.asunto,
          textContent: mensaje.texto,
          ...(mensaje.html ? { htmlContent: mensaje.html } : {}),
          // La API recibe el contenido en base64: no hay forma de subir un
          // archivo, y los PDF de los reportes se generan en memoria.
          ...(mensaje.adjuntos?.length
            ? {
                attachment: mensaje.adjuntos.map((a) => ({
                  name: a.nombre,
                  content: a.contenido.toString('base64'),
                })),
              }
            : {}),
        }),
      });

      const cuerpo = (await respuesta.json().catch(() => ({}))) as RespuestaBrevo;

      if (!respuesta.ok) {
        // El mensaje de Brevo dice qué pasó —cuota agotada, remitente sin
        // verificar, clave inválida—, y es lo único que permite corregirlo.
        const motivo = cuerpo.message ?? `Brevo respondió ${respuesta.status}`;
        console.error(`[correo] falló el envío a ${mensaje.para.join(', ')}: ${motivo}`);
        return { enviado: false, referencia: null, motivo };
      }

      return { enviado: true, referencia: cuerpo.messageId ?? null };
    } catch (error) {
      const motivo =
        error instanceof Error && error.name === 'TimeoutError'
          ? `Brevo no respondió en ${TIEMPO_MAXIMO_MS / 1000} segundos`
          : error instanceof Error
            ? error.message
            : 'error desconocido';

      console.error(`[correo] falló el envío a ${mensaje.para.join(', ')}: ${motivo}`);
      return { enviado: false, referencia: null, motivo };
    }
  }
}
