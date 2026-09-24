import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { ErrorApp } from '../errors/error-app.js';
import { TAMANO_MAXIMO_IMAGEN_PRODUCTO } from '../config/dominio.js';

/**
 * Recibe la foto de un producto como `multipart/form-data`, en memoria.
 *
 * Nada se escribe a disco: en Railway el sistema de archivos es efímero y un
 * redeploy borraría cualquier archivo guardado ahí. El archivo llega entero a
 * `req.file.buffer` y de ahí pasa directo a la base de datos, junto con el
 * resto del producto (ver `producto.model.ts`).
 *
 * Multer reporta sus propios errores por callback en vez de lanzarlos, así
 * que Express 5 no los propaga solo: se traducen aquí a `ErrorApp` para que
 * el manejador central los entienda igual que a cualquier otro.
 */
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO_IMAGEN_PRODUCTO },
}).single('imagen');

export function subirImagenProducto(req: Request, res: Response, next: NextFunction) {
  subida(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      const limiteMb = TAMANO_MAXIMO_IMAGEN_PRODUCTO / (1024 * 1024);
      next(new ErrorApp(413, `La imagen supera el máximo permitido de ${limiteMb} MB`));
      return;
    }
    next(new ErrorApp(400, 'No se pudo procesar el archivo enviado'));
  });
}
