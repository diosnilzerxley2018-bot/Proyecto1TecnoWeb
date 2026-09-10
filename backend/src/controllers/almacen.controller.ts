import type { Request, Response } from 'express';
import * as almacenService from '../services/almacen.service.js';

/** CU-INV-02 — Gestionar Almacén. */

export async function listar(_req: Request, res: Response) {
  res.json(await almacenService.listar());
}

export async function obtener(req: Request, res: Response) {
  res.json(await almacenService.obtener(Number(req.params.id)));
}

export async function crear(req: Request, res: Response) {
  res.status(201).json(await almacenService.crear(req.body));
}

export async function actualizar(req: Request, res: Response) {
  res.json(await almacenService.actualizar(Number(req.params.id), req.body));
}

export async function eliminar(req: Request, res: Response) {
  await almacenService.eliminar(Number(req.params.id));
  res.status(204).end();
}
