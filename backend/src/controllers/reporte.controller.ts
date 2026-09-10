import type { Request, Response } from 'express';
import * as reporteService from '../services/reporte.service.js';
import { esquemaReporteVentas } from '../dtos/reporte.dto.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';
import { ErrorApp } from '../errors/error-app.js';

/** RF-VEN-07 — reporte parametrizado de ventas. */

/** Los filtros llegan por query, que es lo natural para una consulta. */
function filtros(req: Request) {
  const resultado = esquemaReporteVentas.safeParse(req.query);
  if (!resultado.success) {
    throw new ErrorApp(400, resultado.error.issues.map((i) => i.message).join('; '));
  }
  return resultado.data;
}

export async function ventas(req: Request, res: Response) {
  res.json(await reporteService.ventas(idUsuarioDeSesion(req), filtros(req)));
}

/**
 * El mismo reporte, en PDF.
 *
 * `inline` y no `attachment`: el navegador lo abre en una pestaña y desde ahí
 * se descarga o se imprime. Forzar la descarga obligaría a abrir el archivo
 * para ver si es el que se quería.
 */
export async function ventasPdf(req: Request, res: Response) {
  const { pdf, nombre } = await reporteService.pdfVentas(idUsuarioDeSesion(req), filtros(req));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
  res.send(pdf);
}

export async function enviarVentas(req: Request, res: Response) {
  res.json(await reporteService.enviarVentasPorCorreo(idUsuarioDeSesion(req), req.body));
}
