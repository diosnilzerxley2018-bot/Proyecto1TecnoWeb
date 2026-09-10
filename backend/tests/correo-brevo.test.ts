import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MensajeroBrevo } from '../src/correo/brevo.js';
import { env } from '../src/config/env.js';

/**
 * Entrega por la API HTTPS de Brevo.
 *
 * Se prueba contra un `fetch` sustituido y no contra Brevo de verdad: la suite
 * no puede depender de una cuota diaria ni de que haya red, y lo que hay que
 * verificar es **qué se le pide a Brevo**, no que Brevo funcione.
 */

const original = { fetch: globalThis.fetch, clave: env.correo.brevoApiKey, remitente: env.correo.remitente };

/** Deja `fetch` respondiendo lo que se le indique, y anota cómo se le llamó. */
function simularRespuesta(estado: number, cuerpo: unknown) {
  const espia = vi.fn().mockResolvedValue({
    ok: estado >= 200 && estado < 300,
    status: estado,
    json: async () => cuerpo,
  });
  globalThis.fetch = espia as unknown as typeof fetch;
  return espia;
}

/** Lo que se le mandó a Brevo en la última llamada. */
const cuerpoEnviado = (espia: ReturnType<typeof vi.fn>) =>
  JSON.parse(espia.mock.calls[0][1].body as string);

beforeEach(() => {
  env.correo.brevoApiKey = 'clave-de-prueba';
  env.correo.remitente = 'NutriExpress <no-responder@nutriexpress.bo>';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = original.fetch;
  env.correo.brevoApiKey = original.clave;
  env.correo.remitente = original.remitente;
  vi.restoreAllMocks();
});

const mensaje = {
  para: 'cliente@correo.bo',
  asunto: 'Pedido confirmado',
  texto: 'Su pedido fue recibido.',
};

describe('MensajeroBrevo', () => {
  it('se declara como mensajero que envía de verdad', () => {
    const m = new MensajeroBrevo();
    expect(m.nombre).toBe('Brevo');
    expect(m.enviaDeVerdad).toBe(true);
  });

  it('llama a la API de Brevo con la clave en la cabecera', async () => {
    const espia = simularRespuesta(201, { messageId: '<abc@brevo>' });

    const r = await new MensajeroBrevo().enviar(mensaje);

    expect(r.enviado).toBe(true);
    expect(r.referencia).toBe('<abc@brevo>');
    expect(espia.mock.calls[0][0]).toBe('https://api.brevo.com/v3/smtp/email');
    expect(espia.mock.calls[0][1].headers['api-key']).toBe('clave-de-prueba');
  });

  /**
   * El resto del sistema escribe el remitente en una sola línea, como lo pide
   * el SMTP. La API lo quiere en dos campos, y traducirlo mal es la causa más
   * común de que Brevo rechace el envío.
   */
  it('separa el nombre y la dirección del remitente', async () => {
    const espia = simularRespuesta(201, { messageId: '<x>' });
    await new MensajeroBrevo().enviar(mensaje);

    expect(cuerpoEnviado(espia).sender).toEqual({
      name: 'NutriExpress',
      email: 'no-responder@nutriexpress.bo',
    });
  });

  it('acepta un remitente que sea solo la dirección', async () => {
    env.correo.remitente = 'avisos@nutriexpress.bo';
    const espia = simularRespuesta(201, { messageId: '<x>' });
    await new MensajeroBrevo().enviar(mensaje);

    expect(cuerpoEnviado(espia).sender).toEqual({ email: 'avisos@nutriexpress.bo' });
  });

  it('manda el destinatario, el asunto y el texto', async () => {
    const espia = simularRespuesta(201, { messageId: '<x>' });
    await new MensajeroBrevo().enviar(mensaje);

    const cuerpo = cuerpoEnviado(espia);
    expect(cuerpo.to).toEqual([{ email: 'cliente@correo.bo' }]);
    expect(cuerpo.subject).toBe('Pedido confirmado');
    expect(cuerpo.textContent).toBe('Su pedido fue recibido.');
    // Sin HTML no se manda el campo, en vez de mandarlo vacío.
    expect(cuerpo).not.toHaveProperty('htmlContent');
  });

  /** Los reportes viajan como PDF, y la API solo acepta base64. */
  it('codifica los adjuntos en base64', async () => {
    const espia = simularRespuesta(201, { messageId: '<x>' });

    await new MensajeroBrevo().enviar({
      ...mensaje,
      adjuntos: [
        { nombre: 'ventas.pdf', contenido: Buffer.from('%PDF-1.3 falso'), tipo: 'application/pdf' },
      ],
    });

    const [adjunto] = cuerpoEnviado(espia).attachment;
    expect(adjunto.name).toBe('ventas.pdf');
    expect(Buffer.from(adjunto.content, 'base64').toString()).toBe('%PDF-1.3 falso');
  });

  describe('Cuando algo falla, no rompe la operación', () => {
    /**
     * Un aviso es un accesorio: que el correo falle no puede hacer que un
     * pedido no se registre. Por eso informa en vez de lanzar.
     */
    it('un rechazo de Brevo devuelve el motivo, no una excepción', async () => {
      simularRespuesta(401, { message: 'Key not found', code: 'unauthorized' });

      const r = await new MensajeroBrevo().enviar(mensaje);

      expect(r.enviado).toBe(false);
      expect(r.motivo).toBe('Key not found');
      expect(r.referencia).toBeNull();
    });

    it('una cuota agotada se informa tal como la explica Brevo', async () => {
      simularRespuesta(402, { message: 'Not enough credits', code: 'not_enough_credits' });

      const r = await new MensajeroBrevo().enviar(mensaje);

      expect(r.enviado).toBe(false);
      expect(r.motivo).toContain('credits');
    });

    it('un fallo de red se informa sin lanzar', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

      const r = await new MensajeroBrevo().enviar(mensaje);

      expect(r.enviado).toBe(false);
      expect(r.motivo).toContain('ENOTFOUND');
    });

    /** Sin clave no se intenta siquiera: el fallo se explica antes de salir. */
    it('sin clave configurada avisa qué falta', async () => {
      env.correo.brevoApiKey = '';
      const espia = simularRespuesta(201, { messageId: '<x>' });

      const r = await new MensajeroBrevo().enviar(mensaje);

      expect(r.enviado).toBe(false);
      expect(r.motivo).toContain('BREVO_API_KEY');
      expect(espia).not.toHaveBeenCalled();
    });

    it('una respuesta sin cuerpo legible igual informa el estado', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => {
          throw new Error('no es JSON');
        },
      }) as unknown as typeof fetch;

      const r = await new MensajeroBrevo().enviar(mensaje);

      expect(r.enviado).toBe(false);
      expect(r.motivo).toContain('503');
    });
  });
});
