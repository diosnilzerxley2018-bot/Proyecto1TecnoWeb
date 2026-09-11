import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import type { Mensaje, Mensajero, ResultadoEnvio } from './mensajero.js';

/**
 * Mensajero real — entrega por SMTP.
 *
 * En el laboratorio de la materia apunta a `localhost:25`, donde `UbuntuTW`
 * tiene Postfix en modo satélite. Apuntar al Postfix local y no directamente a
 * `TecnoCorreo` es deliberado: **si el servidor de correo está apagado,
 * Postfix encola el mensaje y lo reintenta**. Apuntando derecho al otro
 * servidor, el envío falla y el aviso se pierde.
 *
 * No pide credenciales por omisión porque Postfix acepta a quien esté en su
 * `mynetworks`, que es como está configurado el laboratorio. Un servidor en la
 * nube sí las exige, y por eso las variables existen.
 */
export class MensajeroSmtp implements Mensajero {
  readonly nombre = 'SMTP';
  readonly enviaDeVerdad = true;

  /**
   * El transporte se crea una sola vez y se reutiliza: nodemailer mantiene un
   * grupo de conexiones, y rearmarlo en cada mensaje abriría una conexión
   * nueva por aviso.
   */
  private transporte: Transporter | null = null;

  private obtenerTransporte(): Transporter {
    if (this.transporte) return this.transporte;

    const { servidor, puerto, usuario, contrasena } = env.correo;

    this.transporte = nodemailer.createTransport({
      host: servidor,
      port: puerto,
      // El puerto 25 hacia un relay de confianza va sin cifrar; en 465 o 587
      // nodemailer negocia TLS por su cuenta.
      secure: puerto === 465,
      ...(usuario ? { auth: { user: usuario, pass: contrasena } } : {}),
      // Un aviso que tarda más que esto ya no le sirve a nadie.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });

    return this.transporte;
  }

  /**
   * Envía, y **nunca lanza**.
   *
   * Un aviso es un accesorio de la operación, no su propósito: que el correo
   * falle no puede hacer que un pedido no se registre. Quien llama decide qué
   * hacer con el resultado, y en la práctica lo único razonable es anotarlo.
   */
  async enviar(mensaje: Mensaje): Promise<ResultadoEnvio> {
    try {
      const info = await this.obtenerTransporte().sendMail({
        from: env.correo.remitente,
        to: mensaje.para,
        subject: mensaje.asunto,
        text: mensaje.texto,
        ...(mensaje.html ? { html: mensaje.html } : {}),
        ...(mensaje.adjuntos?.length
          ? {
              attachments: mensaje.adjuntos.map((a) => ({
                filename: a.nombre,
                content: a.contenido,
                contentType: a.tipo,
              })),
            }
          : {}),
      });

      return { enviado: true, referencia: info.messageId ?? null };
    } catch (error) {
      const motivo = error instanceof Error ? error.message : 'error desconocido';
      console.error(`[correo] falló el envío a ${mensaje.para.join(', ')}: ${motivo}`);
      return { enviado: false, referencia: null, motivo };
    }
  }
}
