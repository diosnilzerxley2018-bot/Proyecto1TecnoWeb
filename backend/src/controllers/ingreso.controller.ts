import type { Request, Response } from 'express';
import * as ingresoService from '../services/ingreso.service.js';
import * as devolucionService from '../services/devolucion.service.js';
import { esquemaFiltroIngresos, esquemaFiltroLotes } from '../dtos/movimiento.dto.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';
import { ErrorApp } from '../errors/error-app.js';

/** CU-INV-03 — Gestionar Ingreso. */

export async function listar(req: Request, res: Response) {
  const filtro = esquemaFiltroIngresos.safeParse(req.query);
  if (!filtro.success) {
    throw new ErrorApp(400, filtro.error.issues.map((i) => i.message).join('; '));
  }
  res.json(await ingresoService.listar(idUsuarioDeSesion(req), filtro.data));
}

/** Las compras que todavía pueden devolverse al proveedor. */
export async function devolubles(req: Request, res: Response) {
  res.json(await devolucionService.comprasDevolubles(idUsuarioDeSesion(req)));
}

/** Inventario › Lotes, vista por ítem. */
export async function lotes(req: Request, res: Response) {
  const filtro = esquemaFiltroLotes.safeParse(req.query);
  if (!filtro.success) {
    throw new ErrorApp(400, filtro.error.issues.map((i) => i.message).join('; '));
  }
  res.json(await ingresoService.lotes(idUsuarioDeSesion(req), filtro.data));
}

export async function obtener(req: Request, res: Response) {
  res.json(await ingresoService.obtener(idUsuarioDeSesion(req), Number(req.params.id)));
}

export async function crear(req: Request, res: Response) {
  res.status(201).json(await ingresoService.crear(idUsuarioDeSesion(req), req.body));
}
