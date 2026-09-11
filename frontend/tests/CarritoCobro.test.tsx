import { describe, it, expect } from 'vitest';

/**
 * El pedido en línea con cobro pendiente (RF-PED-05).
 *
 * Confirmar un pedido **vacía el carrito** —el pedido ya existe y reservó su
 * stock— y a la vez tiene que mostrar el código de pago. Las dos cosas chocan
 * si la pantalla decide que un carrito vacío no tiene nada que mostrar: la
 * guarda corta el render antes de llegar al diálogo, y el cliente ve «Su
 * carrito está vacío» en lugar del QR que acaba de pedir.
 *
 * Se prueba la condición y no el componente entero porque lo que falló fue
 * exactamente eso: el orden de dos guardas.
 */

/** La regla tal como quedó en la pantalla del carrito. */
const muestraCarritoVacio = (lineas: number, cobro: object | null) =>
  lineas === 0 && !cobro;

describe('Qué se muestra tras confirmar el pedido', () => {
  it('con el carrito vacío y sin cobro, se muestra el estado vacío', () => {
    expect(muestraCarritoVacio(0, null)).toBe(true);
  });

  /** El caso que fallaba: se vació el carrito pero hay un código que mostrar. */
  it('con el carrito vacío y un cobro abierto, NO se muestra el estado vacío', () => {
    expect(muestraCarritoVacio(0, { estado: 'Pendiente' })).toBe(false);
  });

  it('con productos en el carrito nunca se muestra el estado vacío', () => {
    expect(muestraCarritoVacio(2, null)).toBe(false);
    expect(muestraCarritoVacio(2, { estado: 'Pendiente' })).toBe(false);
  });
});
