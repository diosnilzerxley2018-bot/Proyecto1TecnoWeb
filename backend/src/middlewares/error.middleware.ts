import type { Request, Response, NextFunction } from 'express';
import { ErrorApp } from '../errors/error-app.js';

export function rutaNoEncontrada(req: Request, res: Response) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

/**
 * Manejador central de errores.
 * En Express 5 los rechazos de promesas en handlers async llegan aquí
 * automáticamente, sin necesidad de envolver cada controlador.
 */
export function manejadorErrores(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ErrorApp) {
    res.status(err.estado).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
}
