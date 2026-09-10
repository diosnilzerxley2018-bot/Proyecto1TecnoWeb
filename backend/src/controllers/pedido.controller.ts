import type { Request, Response } from 'express';
import * as pedidoService from '../services/pedido.service.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';

/** CU-PED-02 — Gestionar Pedido. Portal del cliente. */

export async function confirmar(req: Request, res: Response) {
  const pedido = await pedidoService.confirmar(idUsuarioDeSesion(req), req.body);
  res.status(201).json(pedido);
}

export async function listar(req: Request, res: Response) {
  res.json(await pedidoService.listar(idUsuarioDeSesion(req)));
}

export async function detalle(req: Request, res: Response) {
  res.json(await pedidoService.detalle(idUsuarioDeSesion(req), Number(req.params.id)));
}

export async function cancelar(req: Request, res: Response) {
  res.json(await pedidoService.cancelar(idUsuarioDeSesion(req), Number(req.params.id)));
}
