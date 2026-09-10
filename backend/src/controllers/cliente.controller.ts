import type { Request, Response } from 'express';
import * as clienteService from '../services/cliente.service.js';
import { esquemaFiltroClientes } from '../dtos/cliente.dto.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';
import { ErrorApp } from '../errors/error-app.js';

/** CU-VEN-02 — Gestionar Cliente. */

export async function listar(req: Request, res: Response) {
  const filtro = esquemaFiltroClientes.safeParse(req.query);
  if (!filtro.success) {
    throw new ErrorApp(400, filtro.error.issues.map((i) => i.message).join('; '));
  }
  res.json(await clienteService.listar(idUsuarioDeSesion(req), filtro.data));
}

export async function obtener(req: Request, res: Response) {
  res.json(await clienteService.obtener(idUsuarioDeSesion(req), Number(req.params.id)));
}

export async function actualizar(req: Request, res: Response) {
  res.json(
    await clienteService.actualizar(idUsuarioDeSesion(req), Number(req.params.id), req.body),
  );
}

export async function obtenerPerfil(req: Request, res: Response) {
  res.json(await clienteService.obtenerPerfil(idUsuarioDeSesion(req)));
}

export async function actualizarPerfil(req: Request, res: Response) {
  res.json(await clienteService.actualizarPerfil(idUsuarioDeSesion(req), req.body));
}
