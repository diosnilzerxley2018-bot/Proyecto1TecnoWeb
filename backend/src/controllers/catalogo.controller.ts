import type { Request, Response } from 'express';
import * as catalogoService from '../services/catalogo.service.js';
import { esquemaBusqueda } from '../dtos/catalogo.dto.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * Un año: la URL lleva la fecha de la foto en `?v=`, así que dos fotos
 * distintas del mismo producto viven en direcciones distintas. No hace falta
 * revalidar nunca una que el navegador ya tiene.
 */
const CACHE_IMAGEN = 'public, max-age=31536000, immutable';

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

/** Sirve la foto del producto en bytes. Ruta pública, sin sesión. */
export async function imagen(req: Request, res: Response) {
  const imagen = await catalogoService.obtenerImagen(Number(req.params.id));
  if (!imagen) throw new ErrorApp(404, 'El producto no tiene una imagen registrada');
  res.set('Cache-Control', CACHE_IMAGEN);
  res.type(imagen.tipo);
  res.send(imagen.datos);
}
