import type { Request, Response } from 'express';
import * as negocioService from '../services/negocio.service.js';
import { esquemaBusquedaSitio } from '../dtos/negocio.dto.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';
import { ErrorApp } from '../errors/error-app.js';

/** RF-PED-03 — información del negocio y búsqueda del encabezado. */

export async function informacion(_req: Request, res: Response) {
  res.json(await negocioService.informacion());
}

/** El buscador del encabezado: productos e información en una sola lista. */
export async function buscar(req: Request, res: Response) {
  const validado = esquemaBusquedaSitio.safeParse(req.query);
  if (!validado.success) {
    throw new ErrorApp(400, validado.error.issues.map((i) => i.message).join('; '));
  }
  res.json(await negocioService.buscar(validado.data.termino));
}

export async function actualizar(req: Request, res: Response) {
  res.json(await negocioService.actualizar(idUsuarioDeSesion(req), req.body));
}
