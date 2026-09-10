import type { Request, Response } from 'express';
import * as ordenService from '../services/orden-produccion.service.js';
import { esquemaFiltroOrdenes } from '../dtos/orden.dto.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';
import { ErrorApp } from '../errors/error-app.js';

/** CU-PRO-02 — Gestionar Orden de Producción, y CU-PRO-04 — Cancelar Orden. */

export async function listar(req: Request, res: Response) {
  const filtro = esquemaFiltroOrdenes.safeParse(req.query);
  if (!filtro.success) {
    throw new ErrorApp(400, filtro.error.issues.map((i) => i.message).join('; '));
  }
  res.json(await ordenService.listar(idUsuarioDeSesion(req), filtro.data));
}

export async function resumen(req: Request, res: Response) {
  const filtro = esquemaFiltroOrdenes.safeParse(req.query);
  if (!filtro.success) {
    throw new ErrorApp(400, filtro.error.issues.map((i) => i.message).join('; '));
  }
  res.json(await ordenService.contarPorEstado(idUsuarioDeSesion(req), filtro.data));
}

export async function obtener(req: Request, res: Response) {
  res.json(await ordenService.obtener(idUsuarioDeSesion(req), Number(req.params.id)));
}

export async function crear(req: Request, res: Response) {
  res.status(201).json(await ordenService.crear(idUsuarioDeSesion(req), req.body));
}

export async function iniciar(req: Request, res: Response) {
  res.json(await ordenService.iniciar(idUsuarioDeSesion(req), Number(req.params.id)));
}

export async function finalizar(req: Request, res: Response) {
  res.json(await ordenService.finalizar(idUsuarioDeSesion(req), Number(req.params.id), req.body));
}

export async function cancelar(req: Request, res: Response) {
  res.json(await ordenService.cancelar(idUsuarioDeSesion(req), Number(req.params.id)));
}
