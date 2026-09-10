import type { Request, Response } from 'express';
import { z } from 'zod';
import { camposPersonales } from '../dtos/perfil.dto.js';
import { esquemaContrasena } from '../dtos/contrasena.dto.js';
import * as usuarioService from '../services/usuario.service.js';
import { esquemaPaginacion } from '../dtos/paginacion.dto.js';
import { ErrorApp } from '../errors/error-app.js';

/** Clase de análisis ctrlUsuario. */

export const esquemaCrear = z.object({
  nombre: z.string().min(1).max(100),
  apellido: z.string().min(1).max(100),
  email: z.email('debe ser un correo válido').max(150),
  telefono: z.string().max(20).nullable().optional(),
  nombreUsuario: z.string().min(4, 'mínimo 4 caracteres').max(50),
  contrasena: esquemaContrasena,
  idRol: z.number().int().positive(),
  // Requeridos cuando el rol corresponde a personal interno (CU-SEG-02)
  idCargo: z.number().int().positive().optional(),
  fechaIngreso: z.iso.date().optional(),
  // Aplican solo cuando el rol es Cliente
  preferenciaAlimentaria: z.string().max(100).nullable().optional(),
  restriccionDietetica: z.string().max(100).nullable().optional(),
});

/**
 * Edición por parte de un administrador (CU-SEG-02).
 *
 * Los cuatro campos personales se toman de `perfil.dto` para que un nombre se
 * valide igual venga de donde venga. Lo que agrega esta pantalla —y que el
 * titular no puede tocar de sí mismo— es el rol y el estado de la cuenta.
 */
export const esquemaActualizar = z
  .object(camposPersonales)
  .extend({
    idRol: z.number().int().positive(),
    activo: z.boolean(),
  })
  .partial();

export async function listar(req: Request, res: Response) {
  const filtro = esquemaPaginacion.safeParse(req.query);
  if (!filtro.success) {
    throw new ErrorApp(400, filtro.error.issues.map((i) => i.message).join('; '));
  }
  res.json(await usuarioService.listar(filtro.data));
}

export async function obtener(req: Request, res: Response) {
  res.json(await usuarioService.obtener(Number(req.params.id)));
}

export async function crear(req: Request, res: Response) {
  const creado = await usuarioService.crear(req.body as z.infer<typeof esquemaCrear>);
  res.status(201).json(creado);
}

export async function actualizar(req: Request, res: Response) {
  res.json(await usuarioService.actualizar(Number(req.params.id), req.body));
}

export async function darDeBaja(req: Request, res: Response) {
  await usuarioService.darDeBaja(Number(req.params.id));
  res.status(204).send();
}

export async function desbloquear(req: Request, res: Response) {
  res.json(await usuarioService.desbloquear(Number(req.params.id)));
}
