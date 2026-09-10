import type { Request, Response } from 'express';
import * as catalogoService from '../services/catalogo.service.js';
import { esquemaBusqueda } from '../dtos/catalogo.dto.js';
import { ErrorApp } from '../errors/error-app.js';

/** CU-PED-01 — Buscar Productos. Rutas públicas del portal. */

export async function buscar(req: Request, res: Response) {
  const parametros = esquemaBusqueda.safeParse(req.query);
  if (!parametros.success) {
    throw new ErrorApp(400, 'Parámetros de búsqueda inválidos');
  }
  res.json(await catalogoService.buscar(parametros.data));
}

export async function detalle(req: Request, res: Response) {
  res.json(await catalogoService.detalle(Number(req.params.id)));
}

export async function listarCategorias(_req: Request, res: Response) {
  res.json(await catalogoService.listarCategorias());
}
