import type { Request, Response } from 'express';
import { z } from 'zod';
import * as rolService from '../services/rol.service.js';

/** Clase de análisis ctrlRolPermiso. */

export const esquemaRol = z.object({
  nombre: z.string().min(1).max(50),
  idsPermiso: z.array(z.number().int().positive()).default([]),
});

export async function listar(_req: Request, res: Response) {
  res.json(await rolService.listar());
}

export async function obtener(req: Request, res: Response) {
  res.json(await rolService.obtener(Number(req.params.id)));
}

export async function listarPermisos(_req: Request, res: Response) {
  res.json(await rolService.listarPermisos());
}

export async function crear(req: Request, res: Response) {
  const { nombre, idsPermiso } = req.body as z.infer<typeof esquemaRol>;
  res.status(201).json(await rolService.crear(nombre, idsPermiso));
}

export async function actualizar(req: Request, res: Response) {
  const { nombre, idsPermiso } = req.body as z.infer<typeof esquemaRol>;
  res.json(await rolService.actualizar(Number(req.params.id), nombre, idsPermiso));
}
