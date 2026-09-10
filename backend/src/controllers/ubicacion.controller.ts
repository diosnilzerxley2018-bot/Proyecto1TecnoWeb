import type { Request, Response } from 'express';
import * as ubicacionService from '../services/ubicacion.service.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';

/**
 * CU-PED-03 — Gestionar Ubicación.
 *
 * El cliente administra sus propias direcciones. El titular sale de la sesión,
 * nunca de la URL: por eso no existe una ruta que reciba el identificador del
 * cliente.
 */

export async function listar(req: Request, res: Response) {
  res.json(await ubicacionService.listar(idUsuarioDeSesion(req)));
}

export async function crear(req: Request, res: Response) {
  res.status(201).json(await ubicacionService.crear(idUsuarioDeSesion(req), req.body));
}

/** Corregir crea una dirección nueva y archiva la anterior. */
export async function reemplazar(req: Request, res: Response) {
  res.json(
    await ubicacionService.reemplazar(idUsuarioDeSesion(req), Number(req.params.id), req.body),
  );
}

export async function eliminar(req: Request, res: Response) {
  await ubicacionService.eliminar(idUsuarioDeSesion(req), Number(req.params.id));
  res.status(204).end();
}
