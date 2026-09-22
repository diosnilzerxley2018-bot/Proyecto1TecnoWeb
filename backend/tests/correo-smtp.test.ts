import { describe, it, expect } from 'vitest';
import { esRelayLocal } from '../src/correo/smtp.js';

/**
 * Entrega por SMTP — a quién se le verifica el certificado.
 *
 * En el laboratorio la aplicación entrega al Postfix de su propia máquina, que
 * anuncia STARTTLS con el certificado autofirmado que trae Ubuntu. Nodemailer
 * cortaba el envío con «self-signed certificate» y ningún aviso salía. Contra
 * ese relay no se verifica: la conexión no sale de la máquina. Contra un
 * servidor remoto sí, que es donde hay red de por medio.
 */
describe('esRelayLocal', () => {
  it('reconoce el relay de la propia máquina', () => {
    expect(esRelayLocal('localhost')).toBe(true);
    expect(esRelayLocal('127.0.0.1')).toBe(true);
    expect(esRelayLocal('::1')).toBe(true);
  });

  it('no se deja confundir por mayúsculas ni espacios del entorno', () => {
    expect(esRelayLocal(' LocalHost ')).toBe(true);
  });

  /** Lo importante: a estos se les sigue verificando el certificado. */
  it('un servidor remoto no es local', () => {
    expect(esRelayLocal('mail.tecnologia.web')).toBe(false);
    expect(esRelayLocal('smtp-relay.brevo.com')).toBe(false);
    // Un nombre que solo empieza igual tampoco cuenta.
    expect(esRelayLocal('localhost.atacante.com')).toBe(false);
  });
});
