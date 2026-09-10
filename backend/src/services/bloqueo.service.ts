import { env } from '../config/env.js';

/**
 * La regla del bloqueo por intentos fallidos (CU-SEG-05, hallazgo H8).
 *
 * Vive en un solo lugar porque **dos caminos distintos la necesitan**: el
 * inicio de sesión, que decide si deja entrar, y el middleware de
 * autenticación, que decide si deja seguir trabajando a quien ya tiene una
 * sesión abierta.
 *
 * Mientras estuvo escrita solo en el login, el middleware ignoraba que un
 * bloqueo caduca: cualquiera que supiera el nombre de usuario del
 * administrador podía **expulsarlo de su sesión** con tres intentos fallidos, y
 * el plazo cumplido no lo devolvía a trabajar hasta que volviera a iniciar
 * sesión. El bloqueo protegía la contraseña y a la vez servía para echar a
 * quien la sabía.
 */

export interface CuentaBloqueable {
  bloqueado: boolean;
  fecha_bloqueo: Date | null;
}

export interface EstadoBloqueo {
  /** Si el bloqueo sigue en pie **ahora**. */
  vigente: boolean;
  /** Minutos que faltan para que caduque. Cero si ya caducó o no aplica. */
  minutosRestantes: number;
}

export function estadoDelBloqueo(cuenta: CuentaBloqueable): EstadoBloqueo {
  if (!cuenta.bloqueado) return { vigente: false, minutosRestantes: 0 };

  const minutos = env.seguridad.minutosDeBloqueo;

  // Con el plazo en cero el bloqueo no caduca: solo lo levanta el
  // administrador. Es una configuración válida, y la más estricta.
  if (minutos <= 0) return { vigente: true, minutosRestantes: 0 };

  const transcurrido = Date.now() - (cuenta.fecha_bloqueo?.getTime() ?? 0);
  const restanteMs = minutos * 60_000 - transcurrido;

  return restanteMs <= 0
    ? { vigente: false, minutosRestantes: 0 }
    : { vigente: true, minutosRestantes: Math.max(1, Math.ceil(restanteMs / 60_000)) };
}

/** El aviso que se le da a quien encuentra su cuenta bloqueada. */
export function mensajeDeBloqueo(estado: EstadoBloqueo): string {
  return estado.minutosRestantes > 0
    ? `La cuenta está bloqueada. Vuelva a intentarlo en ${estado.minutosRestantes} minuto(s) o contacte al administrador.`
    : 'La cuenta se encuentra bloqueada. Contacte al administrador.';
}
