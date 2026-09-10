import { env } from '../config/env.js';
import { MensajeroSimulado } from './simulado.js';
import { MensajeroSmtp } from './smtp.js';
import { MensajeroBrevo } from './brevo.js';
import type { Mensajero } from './mensajero.js';

export type { Mensajero, Mensaje, Adjunto, ResultadoEnvio } from './mensajero.js';
export { MensajeroSimulado } from './simulado.js';

/**
 * Único punto donde se decide con qué se envía.
 *
 * Se resuelve una vez y se guarda: el modo no cambia en caliente —a diferencia
 * del cobro— porque depende de si el servidor tiene un relay disponible, y eso
 * no es una decisión que se tome desde una pantalla.
 */
let vigente: Mensajero | null = null;

export function mensajero(): Mensajero {
  if (!vigente) {
    // Cualquier valor no reconocido deja el sistema sin enviar nada. Es la
    // falla segura: equivocarse hacia el lado que no molesta a nadie. Un modo
    // mal escrito no debe empezar a mandar correos de verdad por su cuenta.
    vigente = elegir(env.correo.modo);
  }
  return vigente;
}

function elegir(modo: string): Mensajero {
  switch (modo) {
    case 'brevo':
      return new MensajeroBrevo();
    // `real` se conserva porque es como quedó documentado el modo SMTP antes
    // de que hubiera un segundo mensajero real.
    case 'smtp':
    case 'real':
      return new MensajeroSmtp();
    default:
      return new MensajeroSimulado();
  }
}

/** Solo para las pruebas, que necesitan volver al estado inicial. */
export function reiniciarMensajero(): void {
  vigente = null;
  MensajeroSimulado.vaciar();
}
