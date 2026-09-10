import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';
import { ErrorApp } from '../errors/error-app.js';

/** Valida el cuerpo de la petición en el servidor (RNF-SEG-06). */
export function validarCuerpo<T>(esquema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const resultado = esquema.safeParse(req.body);
    if (!resultado.success) {
      const detalle = resultado.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(' | ');
      throw new ErrorApp(400, `Datos inválidos. ${detalle}`);
    }
    req.body = resultado.data;
    next();
  };
}

/** Valida que el parámetro :id sea un entero positivo. */
export function validarIdParam(req: Request, _res: Response, next: NextFunction) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorApp(400, 'El identificador debe ser un entero positivo');
  next();
}
