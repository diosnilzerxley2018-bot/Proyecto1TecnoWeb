import type { Request, Response } from 'express';
import * as visitaService from '../services/visita.service.js';
import { esquemaRegistrarVisita } from '../dtos/visita.dto.js';
import { ErrorApp } from '../errors/error-app.js';

/** RF-WEB-03 — contador de visitas. */

export async function consultar(_req: Request, res: Response) {
  res.json(await visitaService.consultar());
}

export async function registrar(req: Request, res: Response) {
  const datos = esquemaRegistrarVisita.safeParse(req.body ?? {});
  if (!datos.success) throw new ErrorApp(400, 'Datos de visita inválidos');
  res.status(201).json(await visitaService.registrar(datos.data.ruta));
}
