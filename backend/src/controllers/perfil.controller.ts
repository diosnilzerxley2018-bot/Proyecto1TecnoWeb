import type { Request, Response } from 'express';
import * as perfilService from '../services/perfil.service.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';

/**
 * Autoservicio de la cuenta propia.
 *
 * Ninguna operación recibe el identificador por la URL: siempre sale de la
 * sesión. Es lo que hace imposible editar la cuenta de otro cambiando un
 * número en la dirección.
 */

export async function obtener(req: Request, res: Response) {
  res.json(await perfilService.obtener(idUsuarioDeSesion(req)));
}

export async function actualizar(req: Request, res: Response) {
  res.json(await perfilService.actualizar(idUsuarioDeSesion(req), req.body));
}

export async function cambiarContrasena(req: Request, res: Response) {
  await perfilService.cambiarContrasena(idUsuarioDeSesion(req), req.body);
  // 204: la operación no devuelve nada, y menos que nada la contraseña.
  res.status(204).end();
}

export async function actualizarPreferencias(req: Request, res: Response) {
  res.json(await perfilService.actualizarPreferencias(idUsuarioDeSesion(req), req.body));
}
