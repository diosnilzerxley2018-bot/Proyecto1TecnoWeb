import type { Request, Response } from 'express';
import { z } from 'zod';
import { esquemaContrasena } from '../dtos/contrasena.dto.js';
import * as authService from '../services/auth.service.js';
import { ErrorApp } from '../errors/error-app.js';

/** Clase de análisis ctrlLogin. */

export const esquemaLogin = z.object({
  nombreUsuario: z.string().min(1, 'requerido').max(50),
  contrasena: z.string().min(1, 'requerida').max(100),
});

export async function login(req: Request, res: Response) {
  const { nombreUsuario, contrasena } = req.body as z.infer<typeof esquemaLogin>;
  const sesion = await authService.iniciarSesion(nombreUsuario, contrasena);
  res.json(sesion);
}

/** Reglas de contraseña del autorregistro (CU-VEN-02: "el sistema valida la
 *  longitud y complejidad de la contraseña en el caso del autorregistro"). */
export const esquemaRegistro = z.object({
  nombre: z.string().min(1).max(100),
  apellido: z.string().min(1).max(100),
  email: z.email('debe ser un correo válido').max(150),
  telefono: z.string().max(20).nullable().optional(),
  nombreUsuario: z.string().min(4, 'mínimo 4 caracteres').max(50),
  contrasena: esquemaContrasena,
  preferenciaAlimentaria: z.string().max(100).nullable().optional(),
  restriccionDietetica: z.string().max(100).nullable().optional(),
});

export async function registro(req: Request, res: Response) {
  const datos = req.body as z.infer<typeof esquemaRegistro>;
  const sesion = await authService.registrarCliente(datos);
  res.status(201).json(sesion);
}

export async function perfil(req: Request, res: Response) {
  if (!req.sesion) throw new ErrorApp(401, 'Sesión no iniciada');
  res.json(await authService.sesionActual(req.sesion.idUsuario));
}

/** El cierre de sesión se resuelve en el cliente descartando el token. */
export function logout(_req: Request, res: Response) {
  res.json({ mensaje: 'Sesión finalizada' });
}
