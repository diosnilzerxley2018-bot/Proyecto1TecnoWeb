import type { Request, Response } from 'express';
import * as productoService from '../services/producto.service.js';
import * as recetaService from '../services/receta.service.js';
import { esquemaFiltroProductos } from '../dtos/producto.dto.js';
import { ErrorApp } from '../errors/error-app.js';

/** CU-PRO-01 y CU-PRO-03 — gestión de productos, recetas e información nutricional. */

export async function listar(req: Request, res: Response) {
  const filtro = esquemaFiltroProductos.safeParse(req.query);
  if (!filtro.success) throw new ErrorApp(400, 'Filtro de productos inválido');
  res.json(await productoService.listar(filtro.data));
}

export async function obtener(req: Request, res: Response) {
  res.json(await productoService.obtener(Number(req.params.id)));
}

export async function crear(req: Request, res: Response) {
  res.status(201).json(await productoService.crear(req.body));
}

export async function actualizar(req: Request, res: Response) {
  res.json(await productoService.actualizar(Number(req.params.id), req.body));
}

export async function eliminar(req: Request, res: Response) {
  await productoService.eliminar(Number(req.params.id));
  res.status(204).end();
}

export async function guardarValorNutricional(req: Request, res: Response) {
  res.json(await productoService.guardarValorNutricional(Number(req.params.id), req.body));
}

export async function listarRecetas(req: Request, res: Response) {
  res.json(await recetaService.listarDeProducto(Number(req.params.id)));
}

export async function crearReceta(req: Request, res: Response) {
  res.status(201).json(await recetaService.crear(Number(req.params.id), req.body));
}
