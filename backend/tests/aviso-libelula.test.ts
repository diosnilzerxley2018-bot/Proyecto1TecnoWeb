import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { PasarelaLibelula } from '../src/pagos/libelula.js';

/**
 * RF-PED-04 — el aviso de pago de Libélula, tal como lo manda de verdad.
 *
 * El contrato está tomado de su propio plugin de WooCommerce (`woo.zip`,
 * `check_ipn_response`), que es la única descripción pública que existe:
 * Libélula llama a la `callback_url` con `transaction_id`, `error`, `message`
 * y `cancel_order`, y el éxito se señala con `error=0`.
 *
 * El código esperaba en cambio un campo `estado`, y como no llega, **todo**
 * aviso legítimo se rechazaba con «Estado de pago no reconocido: undefined».
 * El cobro se quedaba pendiente y el cliente veía un pedido sin pagar después
 * de haber pagado.
 */
const pasarela = new PasarelaLibelula();

describe('Aviso de Libélula', () => {
  it('«error=0» es un cobro hecho', () => {
    const aviso = pasarela.interpretarAviso({
      transaction_id: '01247766-b41e-4160-bb36-60f007548845',
      error: '0',
      message: 'Pago procesado',
    });

    expect(aviso.estado).toBe('Pagado');
    expect(aviso.idTransaccionExterna).toBe('01247766-b41e-4160-bb36-60f007548845');
  });

  it('cualquier otro código de error es un cobro que no se hizo', () => {
    expect(pasarela.interpretarAviso({ transaction_id: 'x', error: '1' }).estado).toBe('Fallido');
    expect(pasarela.interpretarAviso({ transaction_id: 'x', error: 7 }).estado).toBe('Fallido');
  });

  /** El cliente abandonó el pago: manda aunque el código diga que no hubo error. */
  it('«cancel_order=1» pesa más que el código de error', () => {
    const aviso = pasarela.interpretarAviso({ transaction_id: 'x', error: '0', cancel_order: '1' });
    expect(aviso.estado).toBe('Fallido');
  });

  /**
   * Libélula no informa el monto. Tomar la ausencia por un cobro de cero
   * convertía cada aviso en un «pago insuficiente» y lo rechazaba.
   */
  it('sin monto informado, no se inventa un cero', () => {
    const aviso = pasarela.interpretarAviso({ transaction_id: 'x', error: '0' });
    expect(aviso.monto).toBeUndefined();
  });

  it('si informa el monto, se conserva para contrastarlo', () => {
    const aviso = pasarela.interpretarAviso({ transaction_id: 'x', error: '0', monto: '35.50' });
    expect(aviso.monto).toBe(35.5);
  });

  /** Se sigue admitiendo por si alguna variante de la pasarela lo envía. */
  it('acepta todavía un campo «estado» explícito', () => {
    expect(pasarela.interpretarAviso({ id_transaccion: 'x', estado: 'PAGADO' }).estado).toBe(
      'Pagado',
    );
  });

  it('un aviso sin desenlace se rechaza, y el mensaje dice qué llegó', () => {
    expect(() => pasarela.interpretarAviso({ transaction_id: 'x' })).toThrow(/no reconocido/);
  });
});

/**
 * El aviso que llega por `GET`, sin cuerpo.
 *
 * Es la forma en que Libélula devuelve al cliente con el desenlace. Express no
 * toca `req.body` cuando la petición no trae contenido, así que queda
 * `undefined`; tratarlo como texto reventaba con un 500 antes de mirar el
 * aviso, y la pasarela recibía un error del servidor en vez de una respuesta.
 */
describe('Aviso recibido por GET', () => {
  it('no revienta por venir sin cuerpo', async () => {
    const r = await request(app)
      .get('/api/pagos/notificacion')
      .query({ testigo: 'cualquiera', ref: 'PEDIDO-1', transaction_id: 'abc', error: '0' });

    // Lo que importa es que lo procese: cualquier respuesta menos un 500.
    expect(r.status).not.toBe(500);
  });

  it('el POST sin cuerpo tampoco', async () => {
    const r = await request(app)
      .post('/api/pagos/notificacion')
      .query({ testigo: 'cualquiera', ref: 'PEDIDO-1', transaction_id: 'abc', error: '0' });

    expect(r.status).not.toBe(500);
  });
});

/**
 * El aviso identifica el cobro con **nuestra** referencia, no con la suya.
 *
 * Tomado literal de un aviso real en producción: en `transaction_id` viene
 * `PEDIDO-16`, que es el `identificador_deuda` que le dimos al registrar la
 * deuda, y no el UUID que Libélula devolvió al crearla. Buscar el cobro solo
 * por ese UUID no encontraba nada y el aviso se descartaba como «de otro
 * ambiente»: el cliente pagaba, el aviso llegaba, y el pedido seguía sin
 * cobrarse. Es el último eslabón que faltaba.
 */
describe('El aviso trae la referencia del comercio', () => {
  const real = {
    ref: 'PEDIDO-16',
    transaction_id: 'PEDIDO-16',
    error: '0',
    message: 'OK',
    cancel_order: '0',
    payment_method: 'ATC_QR',
    payment_method_id: '30',
    monto_total: '0.10',
    numeroReferencia: '53078694',
  };

  it('se interpreta como cobrado, con su monto', () => {
    const aviso = pasarela.interpretarAviso(real);

    expect(aviso.estado).toBe('Pagado');
    expect(aviso.idTransaccionExterna).toBe('PEDIDO-16');
    // `monto_total`, que es como Libélula lo llama. Sin esto el cobro se
    // rechazaba por pagar menos que el total de la venta.
    expect(aviso.monto).toBe(0.1);
  });
});
