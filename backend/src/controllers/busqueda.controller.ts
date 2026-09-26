import type { Request, Response } from 'express';
import * as busquedaService from '../services/busqueda.service.js';
import { esquemaBusquedaGeneral } from '../dtos/busqueda.dto.js';
import { ErrorApp } from '../errors/error-app.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';

/** Buscador general del escritorio del personal. */

export async function buscar(req: Request, res: Response) {
  const consulta = esquemaBusquedaGeneral.safeParse(req.query);
  if (!consulta.success) {
    throw new ErrorApp(400, consulta.error.issues.map((i) => i.message).join('; '));
  }
  res.json(await busquedaService.buscar(idUsuarioDeSesion(req), consulta.data.q));
}
