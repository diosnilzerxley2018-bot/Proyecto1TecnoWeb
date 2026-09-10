import type { Request } from 'express';
import { ErrorApp } from '../errors/error-app.js';

/**
 * Identificador del usuario autenticado.
 *
 * Se lee siempre de la sesión y nunca del cuerpo ni de la URL: aceptarlo del
 * cliente permitiría operar en nombre de otro usuario (RNF-SEG-04).
 */
export function idUsuarioDeSesion(req: Request): number {
  if (!req.sesion) throw new ErrorApp(401, 'Sesión no iniciada');
  return req.sesion.idUsuario;
}
