import { describe, it, expect } from 'vitest';
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
