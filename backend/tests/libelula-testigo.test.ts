import { describe, it, expect, beforeAll } from 'vitest';
import { PasarelaLibelula } from '../src/pagos/libelula.js';
import { env } from '../src/config/env.js';

/**
 * El testigo que autentica un aviso de pago de Libélula.
 *
 * Libélula **no firma sus avisos**, así que lo que impide que un tercero
 * marque un cobro como pagado es que la dirección de aviso lleva un testigo
 * que solo el servidor pudo calcular.
 *
 * La primera versión lo guardaba en un mapa en memoria, y eso falló en
 * producción exactamente como estaba previsto que fallara: el servidor se
 * reinicia en cada despliegue, el mapa queda vacío, y los avisos de los cobros
 * abiertos antes del reinicio se rechazaban. El cliente pagaba, el dinero
 * salía de su cuenta, y el pedido se quedaba esperando.
 */

const pasarela = new PasarelaLibelula();

/** Recalcula el testigo como lo hace la pasarela al abrir el cobro. */
async function testigoPara(referencia: string): Promise<string> {
  const { createHmac } = await import('node:crypto');
  return createHmac('sha256', env.jwtSecret).update(referencia).digest('hex').slice(0, 32);
}

const avisoDe = (testigo?: string, referencia?: string) => ({
  ...(testigo ? { 'x-testigo-pago': testigo } : {}),
  ...(referencia ? { 'x-referencia-pago': referencia } : {}),
});

describe('Verificación del aviso de pago', () => {
  it('acepta un testigo que corresponde a su referencia', async () => {
    const testigo = await testigoPara('VENTA-42');
    expect(pasarela.verificarFirma('{}', avisoDe(testigo, 'VENTA-42'))).toBe(true);
  });

  /**
   * El caso que motivó el cambio: el testigo se recalcula, así que un
   * reinicio del servidor —que borra toda la memoria— no lo invalida.
   */
  it('sigue valiendo aunque el proceso haya perdido toda su memoria', async () => {
    const testigo = await testigoPara('PEDIDO-7');

    // Una instancia nueva es lo más parecido a un proceso recién arrancado.
    const otraInstancia = new PasarelaLibelula();
    expect(otraInstancia.verificarFirma('{}', avisoDe(testigo, 'PEDIDO-7'))).toBe(true);
  });

  it('rechaza un testigo que no corresponde a esa referencia', async () => {
    const testigo = await testigoPara('VENTA-42');
    // El testigo es válido, pero de otro cobro.
    expect(pasarela.verificarFirma('{}', avisoDe(testigo, 'VENTA-99'))).toBe(false);
  });

  it('rechaza un testigo inventado', () => {
    expect(pasarela.verificarFirma('{}', avisoDe('a'.repeat(32), 'VENTA-42'))).toBe(false);
  });

  it('rechaza un aviso sin testigo', () => {
    expect(pasarela.verificarFirma('{}', avisoDe(undefined, 'VENTA-42'))).toBe(false);
  });

  /** Sin referencia no hay con qué recalcular: no se puede dar por bueno. */
  it('rechaza un aviso sin referencia', async () => {
    const testigo = await testigoPara('VENTA-42');
    expect(pasarela.verificarFirma('{}', avisoDe(testigo, undefined))).toBe(false);
  });

  it('rechaza un testigo de largo distinto', () => {
    expect(pasarela.verificarFirma('{}', avisoDe('corto', 'VENTA-42'))).toBe(false);
  });

  /** Cada cobro tiene el suyo: uno no sirve para marcar otro como pagado. */
  it('dos cobros distintos tienen testigos distintos', async () => {
    const uno = await testigoPara('VENTA-1');
    const dos = await testigoPara('VENTA-2');
    expect(uno).not.toBe(dos);
  });
});
