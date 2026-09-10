import type { Request, Response } from 'express';
import * as ventaService from '../services/venta.service.js';
import { esquemaFiltroVentas } from '../dtos/venta.dto.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';
import { ErrorApp } from '../errors/error-app.js';

/** CU-VEN-01 — Gestionar Venta. */

export async function listar(req: Request, res: Response) {
  const filtro = esquemaFiltroVentas.safeParse(req.query);
  if (!filtro.success) {
    throw new ErrorApp(400, filtro.error.issues.map((i) => i.message).join('; '));
  }
  res.json(
    await ventaService.listar(idUsuarioDeSesion(req), {
      tipoVenta: filtro.data.tipo,
      idCliente: filtro.data.cliente,
      desde: filtro.data.desde,
      hasta: filtro.data.hasta,
      pagina: filtro.data.pagina,
      porPagina: filtro.data.porPagina,
    }),
  );
}

export async function obtener(req: Request, res: Response) {
  res.json(await ventaService.obtener(idUsuarioDeSesion(req), Number(req.params.id)));
}

export async function crear(req: Request, res: Response) {
  res.status(201).json(await ventaService.crear(idUsuarioDeSesion(req), req.body));
}

/**
 * Consulta previa: qué habría que producir para poder vender.
 * No modifica nada; el punto de venta la usa para mostrar el consumo antes de
 * que el vendedor confirme.
 */
export async function evaluar(req: Request, res: Response) {
  res.json(await ventaService.evaluar(idUsuarioDeSesion(req), req.body));
}

/** Venta que produce al instante lo que falte, en una sola transacción. */
export async function crearConProduccion(req: Request, res: Response) {
  res.status(201).json(await ventaService.crearConProduccion(idUsuarioDeSesion(req), req.body));
}

/** RF-VEN-06 — comprobante de la venta registrada. */
export async function comprobante(req: Request, res: Response) {
  res.json(await ventaService.comprobante(idUsuarioDeSesion(req), Number(req.params.id)));
}

/**
 * CU-VEN-01, excepción: anular una venta registrada.
 *
 * Devuelve el stock al inventario y cierra el cobro. Si la venta estaba
 * cobrada, la respuesta avisa que corresponde devolverle el dinero al cliente.
 */
export async function anular(req: Request, res: Response) {
  res.json(await ventaService.anular(idUsuarioDeSesion(req), Number(req.params.id), req.body));
}
