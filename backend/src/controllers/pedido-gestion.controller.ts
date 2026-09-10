import type { Request, Response } from 'express';
import * as gestionService from '../services/pedido-gestion.service.js';
import { esquemaFiltroPedidos } from '../dtos/pedido.dto.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';
import { ErrorApp } from '../errors/error-app.js';

/** CU-PED-02 — Gestionar Pedido, lado del empleado (RF-PED-07 y RF-PED-08). */

export async function listar(req: Request, res: Response) {
  const filtro = esquemaFiltroPedidos.safeParse(req.query);
  if (!filtro.success) {
    throw new ErrorApp(400, filtro.error.issues.map((i) => i.message).join('; '));
  }
  res.json(await gestionService.listar(idUsuarioDeSesion(req), filtro.data));
}

export async function detalle(req: Request, res: Response) {
  res.json(await gestionService.detalle(idUsuarioDeSesion(req), Number(req.params.id)));
}

export async function resumen(req: Request, res: Response) {
  const filtro = esquemaFiltroPedidos.safeParse(req.query);
  if (!filtro.success) {
    throw new ErrorApp(400, filtro.error.issues.map((i) => i.message).join('; '));
  }
  res.json(await gestionService.contarPorEstado(idUsuarioDeSesion(req), filtro.data));
}

export async function listarRepartidores(req: Request, res: Response) {
  res.json(await gestionService.listarRepartidores(idUsuarioDeSesion(req)));
}

export async function avanzarEstado(req: Request, res: Response) {
  res.json(
    await gestionService.avanzarEstado(
      idUsuarioDeSesion(req),
      Number(req.params.id),
      req.body.estado,
    ),
  );
}

export async function asignarRepartidor(req: Request, res: Response) {
  res.json(
    await gestionService.asignarRepartidor(
      idUsuarioDeSesion(req),
      Number(req.params.id),
      req.body.idRepartidor,
    ),
  );
}

/** RF-PED-07 — a quién conviene asignarle el pedido. Sugiere, no asigna. */
export async function sugerirRepartidor(req: Request, res: Response) {
  res.json(await gestionService.sugerirRepartidor(idUsuarioDeSesion(req), Number(req.params.id)));
}

/** RF-PED-07 — los pedidos asignados a quien consulta. */
export async function misEntregas(req: Request, res: Response) {
  res.json(await gestionService.misEntregas(idUsuarioDeSesion(req)));
}

/** El repartidor declara si está de turno. */
export async function cambiarDisponibilidad(req: Request, res: Response) {
  res.json(
    await gestionService.cambiarDisponibilidad(idUsuarioDeSesion(req), req.body.disponible),
  );
}
