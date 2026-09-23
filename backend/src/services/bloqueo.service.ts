
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
  /** Bloqueos acumulados desde el último acceso correcto. */
  veces_bloqueado: number;
}

export interface EstadoBloqueo {
  /** Si el bloqueo sigue en pie **ahora**. */
  vigente: boolean;
  /** Minutos que faltan para que caduque. Cero si ya caducó o no aplica. */
  minutosRestantes: number;
  /** El bloqueo ya no caduca: solo lo levanta el administrador. */
  definitivo: boolean;
}

/**
 * CU-SEG-05 — el bloqueo escala con la insistencia.
 *
 * El primero dura un minuto y el segundo cinco; del tercero en adelante ya no
 * caduca. La progresión es la que separa al dueño distraído del que está
 * probando contraseñas: a quien se equivocó tres veces y espera un minuto el
 * sistema apenas lo molesta, mientras que para quien insiste el costo crece
 * hasta volverse una puerta cerrada.
 *
 * Se declara como tabla y no como cadena de `if` por la misma razón que las
 * transiciones de estado: la regla se lee de un vistazo y agregar un escalón
 * es agregar un número.
 */
export const MINUTOS_POR_BLOQUEO = [1, 5] as const;

/** Minutos que dura el bloqueo número `veces`, o `null` si ya no caduca. */
export function duracionDelBloqueo(veces: number): number | null {
  return MINUTOS_POR_BLOQUEO[veces - 1] ?? null;
}

export function estadoDelBloqueo(cuenta: CuentaBloqueable): EstadoBloqueo {
  if (!cuenta.bloqueado) return { vigente: false, minutosRestantes: 0, definitivo: false };

  const minutos = duracionDelBloqueo(cuenta.veces_bloqueado);

  // Agotada la escalada, el bloqueo no caduca: solo lo levanta el
  // administrador desde la gestión de usuarios (CU-SEG-05).
  if (minutos === null) return { vigente: true, minutosRestantes: 0, definitivo: true };

  const transcurrido = Date.now() - (cuenta.fecha_bloqueo?.getTime() ?? 0);
  const restanteMs = minutos * 60_000 - transcurrido;

  return restanteMs <= 0
    ? { vigente: false, minutosRestantes: 0, definitivo: false }
    : {
        vigente: true,
        minutosRestantes: Math.max(1, Math.ceil(restanteMs / 60_000)),
        definitivo: false,
      };
}

/** El aviso que se le da a quien encuentra su cuenta bloqueada. */
export function mensajeDeBloqueo(estado: EstadoBloqueo): string {
  if (estado.definitivo) {
    return 'La cuenta quedó bloqueada tras varios bloqueos seguidos. Solo el administrador puede reabrirla.';
  }
  return estado.minutosRestantes > 0
    ? `La cuenta está bloqueada. Vuelva a intentarlo en ${estado.minutosRestantes} minuto(s) o contacte al administrador.`
    : 'La cuenta se encuentra bloqueada. Contacte al administrador.';
}
