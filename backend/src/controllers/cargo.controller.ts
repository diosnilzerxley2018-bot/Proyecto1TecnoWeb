import type { Request, Response } from 'express';
import * as cargoService from '../services/cargo.service.js';

/** Catálogo de cargos, requerido al registrar personal interno (CU-SEG-02). */
export async function listar(_req: Request, res: Response) {
  res.json(await cargoService.listar());
}
