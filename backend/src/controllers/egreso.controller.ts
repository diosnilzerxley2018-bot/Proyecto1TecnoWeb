import type { Request, Response } from 'express';
import * as egresoService from '../services/egreso.service.js';
import { esquemaFiltroEgresos } from '../dtos/movimiento.dto.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';
import { ErrorApp } from '../errors/error-app.js';

/** CU-INV-04 — Gestionar Egreso. */

export async function listar(req: Request, res: Response) {
  const filtro = esquemaFiltroEgresos.safeParse(req.query);
  if (!filtro.success) {
    throw new ErrorApp(400, filtro.error.issues.map((i) => i.message).join('; '));
  }
  res.json(await egresoService.listar(idUsuarioDeSesion(req), filtro.data));
}

export async function obtener(req: Request, res: Response) {
  res.json(await egresoService.obtener(idUsuarioDeSesion(req), Number(req.params.id)));
}

export async function crear(req: Request, res: Response) {
  res.status(201).json(await egresoService.crear(idUsuarioDeSesion(req), req.body));
}
