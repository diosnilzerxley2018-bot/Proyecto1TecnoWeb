import type { Request, Response } from 'express';
import * as recetaService from '../services/receta.service.js';

/** CU-PRO-01 — operaciones sobre una versión de receta concreta. */

export async function obtener(req: Request, res: Response) {
  res.json(await recetaService.obtener(Number(req.params.id)));
}

export async function actualizar(req: Request, res: Response) {
  res.json(await recetaService.actualizar(Number(req.params.id), req.body));
}

export async function activar(req: Request, res: Response) {
  res.json(await recetaService.activar(Number(req.params.id)));
}

export async function eliminar(req: Request, res: Response) {
  await recetaService.eliminar(Number(req.params.id));
  res.status(204).end();
}
