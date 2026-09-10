import type { Request, Response } from 'express';
import { z } from 'zod';
import * as permisoService from '../services/permiso.service.js';

/** Clase de análisis ctrlAsignarPermiso. */

export const esquemaAsignar = z.object({
  idsRolPermiso: z.array(z.number().int().positive()),
});

export async function obtenerDeUsuario(req: Request, res: Response) {
  res.json(await permisoService.permisosDeUsuario(Number(req.params.id)));
}

export async function asignar(req: Request, res: Response) {
  const { idsRolPermiso } = req.body as z.infer<typeof esquemaAsignar>;
  res.json(await permisoService.asignarPermisos(Number(req.params.id), idsRolPermiso));
}
