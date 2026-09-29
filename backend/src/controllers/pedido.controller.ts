import type { Request, Response } from 'express';
import * as pedidoService from '../services/pedido.service.js';
import * as comprobanteService from '../services/comprobante.service.js';
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

/** El comprobante del pedido pagado, para verlo en pantalla. */
export async function comprobante(req: Request, res: Response) {
  res.json(await comprobanteService.paraCliente(idUsuarioDeSesion(req), Number(req.params.id)));
}

/** El mismo comprobante en PDF, con forma de tique. */
export async function comprobantePdf(req: Request, res: Response) {
  const id = Number(req.params.id);
  const pdf = await comprobanteService.pdfParaCliente(idUsuarioDeSesion(req), id);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="comprobante-pedido-${String(id).padStart(5, '0')}.pdf"`,
  );
  res.send(pdf);
}

/** Lo manda al correo de la cuenta; el destino no viaja en la petición. */
export async function enviarComprobante(req: Request, res: Response) {
  res.json(await comprobanteService.enviarAlCliente(idUsuarioDeSesion(req), Number(req.params.id)));
}
