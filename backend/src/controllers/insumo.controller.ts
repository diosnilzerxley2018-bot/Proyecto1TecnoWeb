import type { Request, Response } from 'express';
import * as insumoService from '../services/insumo.service.js';
import { esquemaFiltroInsumos } from '../dtos/insumo.dto.js';
import { ErrorApp } from '../errors/error-app.js';

/** CU-INV-01 — Gestionar Insumo. */

export async function listar(req: Request, res: Response) {
  const filtro = esquemaFiltroInsumos.safeParse(req.query);
  if (!filtro.success) throw new ErrorApp(400, 'Filtro de insumos inválido');
  res.json(await insumoService.listar(filtro.data));
}

export async function obtener(req: Request, res: Response) {
  res.json(await insumoService.obtener(Number(req.params.id)));
}

export async function listarUnidades(_req: Request, res: Response) {
  res.json(await insumoService.listarUnidades());
}

export async function crear(req: Request, res: Response) {
  res.status(201).json(await insumoService.crear(req.body));
}

export async function actualizar(req: Request, res: Response) {
  res.json(await insumoService.actualizar(Number(req.params.id), req.body));
}

export async function eliminar(req: Request, res: Response) {
  await insumoService.eliminar(Number(req.params.id));
  res.status(204).end();
}
