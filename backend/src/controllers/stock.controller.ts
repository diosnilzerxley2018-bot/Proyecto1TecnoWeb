import type { Request, Response } from 'express';
import * as controlStockService from '../services/control-stock.service.js';
import { esquemaFiltroStock } from '../dtos/stock.dto.js';
import { ErrorApp } from '../errors/error-app.js';

/** CU-INV-05 — Control de Stock. */

export async function consultar(req: Request, res: Response) {
  const filtro = esquemaFiltroStock.safeParse(req.query);
  if (!filtro.success) throw new ErrorApp(400, 'Filtro de stock inválido');
  res.json(
    await controlStockService.consultar({
      idAlmacen: filtro.data.almacen,
      termino: filtro.data.termino,
      tipo: filtro.data.tipo,
    }),
  );
}

export async function listarAlertas(_req: Request, res: Response) {
  res.json(await controlStockService.alertas());
}

/** Lotes por vencer (hallazgo A6). `?dias=N` acota el horizonte. */
export async function listarVencimientos(req: Request, res: Response) {
  const dias = req.query.dias === undefined ? undefined : Number(req.query.dias);
  if (dias !== undefined && (!Number.isFinite(dias) || dias < 0)) {
    throw new ErrorApp(400, 'El horizonte en días debe ser un número no negativo');
  }
  res.json(await controlStockService.vencimientos(dias));
}
