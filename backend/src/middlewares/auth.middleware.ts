import type { Request, Response, NextFunction } from 'express';
import { verificarToken, type PayloadToken } from '../utils/jwt.js';
import { permisosDeUsuario } from '../models/permiso.model.js';
import * as usuarioModel from '../models/usuario.model.js';
import { estadoDelBloqueo, mensajeDeBloqueo } from '../services/bloqueo.service.js';
import { ErrorApp } from '../errors/error-app.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sesion?: PayloadToken;
    }
  }
}

/**
 * Exige una sesión válida **y una cuenta habilitada** (RNF-SEG-01, RNF-SEG-05).
 *
 * La firma del token no alcanza. Un token es una foto del momento en que se
 * emitió, y vive ocho horas: sin esta comprobación, bloquear o dar de baja a
 * alguien le impedía *volver a entrar* pero no le impedía **seguir
 * trabajando** con la sesión que ya tenía abierta. Un empleado despedido a las
 * nueve de la mañana seguía registrando ventas hasta las cinco de la tarde.
 *
 * Cuesta una consulta por petición sobre la clave primaria, que trae tres
 * campos. Es el precio de que revocar el acceso surta efecto en la petición
 * siguiente y no en ocho horas.
 */
export async function requiereAutenticacion(req: Request, _res: Response, next: NextFunction) {
  const cabecera = req.headers.authorization;
  if (!cabecera?.startsWith('Bearer ')) {
    throw new ErrorApp(401, 'Token de sesión ausente');
  }

  let sesion: PayloadToken;
  try {
    sesion = verificarToken(cabecera.slice(7));
  } catch {
    throw new ErrorApp(401, 'Token de sesión inválido o expirado');
  }

  const cuenta = await usuarioModel.estadoDeCuenta(sesion.idUsuario);

  // La cuenta pudo darse de baja o bloquearse después de emitido el token.
  if (!cuenta) throw new ErrorApp(401, 'La cuenta de esta sesión ya no existe');
  if (!cuenta.activo) throw new ErrorApp(401, 'La cuenta fue dada de baja');

  if (cuenta.bloqueado) {
    /*
     * El bloqueo **caduca**, y aquí hay que saberlo igual que en el login.
     *
     * Mirando solo la bandera, tres intentos fallidos de un desconocido
     * expulsaban de su sesión a quien sí sabía la contraseña, y el plazo
     * cumplido no lo devolvía a trabajar: la bandera seguía encendida hasta
     * que alguien intentara iniciar sesión. El bloqueo protegía la cuenta y a
     * la vez servía para echar a su dueño.
     */
    const bloqueo = estadoDelBloqueo(cuenta);
    if (bloqueo.vigente) {
      throw new ErrorApp(401, `La cuenta fue bloqueada. ${mensajeDeBloqueo(bloqueo)}`);
    }

    // Cumplido el plazo se apaga la bandera, para no repetir esta cuenta en
    // cada petición y para que la base refleje el estado real.
    await usuarioModel.desbloquear(sesion.idUsuario);
  }

  req.sesion = sesion;
  next();
}

/**
 * Exige un permiso concreto.
 * RNF-SEG-04: los permisos se consultan en el servidor en cada petición,
 * no se confía en el token ni en las restricciones de la interfaz.
 */
export function requierePermiso(nombrePermiso: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.sesion) throw new ErrorApp(401, 'Sesión no iniciada');
    const permisos = await permisosDeUsuario(req.sesion.idUsuario);
    if (!permisos.includes(nombrePermiso)) {
      throw new ErrorApp(403, `No tiene el permiso requerido: ${nombrePermiso}`);
    }
    next();
  };
}
