import * as permisoModel from '../models/permiso.model.js';

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

/** El escalón más alto que sí caduca. Es el techo de quien no puede quedar fuera. */
const ULTIMO_PLAZO = MINUTOS_POR_BLOQUEO[MINUTOS_POR_BLOQUEO.length - 1];

/**
 * Cuánto dura el bloqueo número `veces`, o `null` si ya no caduca.
 *
 * Es el único lugar donde se decide eso, y por eso lo usan tanto el estado de
 * un bloqueo en curso como el aviso del que se acaba de aplicar: si la regla
 * viviera en los dos, con el tiempo dirían cosas distintas.
 */
export function plazoDelBloqueo(
  veces: number,
  opciones: { nuncaDefinitivo?: boolean } = {},
): number | null {
  const minutos = duracionDelBloqueo(veces);
  if (minutos !== null) return minutos;
  return opciones.nuncaDefinitivo ? ULTIMO_PLAZO : null;
}

/**
 * Permiso que hace falta para reabrir una cuenta ajena.
 *
 * Quien lo tiene **no puede quedar bloqueado para siempre**: si la única
 * cuenta capaz de desbloquear queda cerrada de forma definitiva, no queda
 * nadie que pueda reabrirla, y bastaban nueve intentos fallidos contra el
 * administrador para dejar el sistema sin salida. Su bloqueo deja de escalar
 * en el último plazo que caduca: sigue frenando a quien insiste —tres
 * intentos cada cinco minutos— pero nunca se vuelve irreversible.
 *
 * Se mira el permiso y no el nombre del rol: lo que crea el punto muerto es
 * *poder desbloquear*, no llamarse «Administrador». Así la regla sigue siendo
 * cierta el día que ese permiso se le dé a otro rol.
 */
export const PERMISO_REABRIR_CUENTAS = 'USUARIO_EDITAR';

/**
 * Si esta cuenta es de las que no pueden quedar fuera para siempre.
 *
 * Cuesta una consulta, y por eso solo se pregunta cuando la cuenta ya está
 * bloqueada, que es cuando la respuesta cambia algo.
 */
export async function puedeReabrirCuentas(idUsuario: number): Promise<boolean> {
  const permisos = await permisoModel.permisosDeUsuario(idUsuario);
  return permisos.includes(PERMISO_REABRIR_CUENTAS);
}

export function estadoDelBloqueo(
  cuenta: CuentaBloqueable,
  opciones: { nuncaDefinitivo?: boolean } = {},
): EstadoBloqueo {
  if (!cuenta.bloqueado) return { vigente: false, minutosRestantes: 0, definitivo: false };

  const minutos = plazoDelBloqueo(cuenta.veces_bloqueado, opciones);

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
    return 'Su cuenta fue bloqueada indefinidamente. Contáctese con el administrador para reabrirla.';
  }
  return estado.minutosRestantes > 0
    ? `La cuenta está bloqueada. Vuelva a intentarlo en ${estado.minutosRestantes} minuto(s) o contacte al administrador.`
    : 'La cuenta se encuentra bloqueada. Contacte al administrador.';
}
