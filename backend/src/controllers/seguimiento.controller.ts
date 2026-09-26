import type { Request, Response } from 'express';
import * as seguimientoService from '../services/seguimiento.service.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';
import type { DatosPosicion } from '../dtos/seguimiento.dto.js';

/** Seguimiento del repartidor en vivo. */

export async function informarPosicion(req: Request, res: Response) {
  await seguimientoService.informarPosicion(idUsuarioDeSesion(req), req.body as DatosPosicion);
  res.status(204).send();
}

export async function dejarDeCompartir(req: Request, res: Response) {
  await seguimientoService.dejarDeCompartir(idUsuarioDeSesion(req));
  res.status(204).send();
}

export async function paraCliente(req: Request, res: Response) {
  res.json(await seguimientoService.paraCliente(idUsuarioDeSesion(req), Number(req.params.id)));
}

export async function paraPersonal(req: Request, res: Response) {
  res.json(await seguimientoService.paraPersonal(idUsuarioDeSesion(req), Number(req.params.id)));
}
