import { prisma } from '../config/prisma.js';
import type { ClientePrisma } from './stock.model.js';

/** Capa Model — tabla `configuracion`, parámetros que el administrador cambia en caliente. */

export const buscar = (clave: string, tx: ClientePrisma = prisma) =>
  tx.configuracion.findUnique({ where: { clave } });

/** La misma fila, con quién la cambió. Se usa solo en la pantalla de ajustes. */
export const buscarConUsuario = (clave: string) =>
  prisma.configuracion.findUnique({
    where: { clave },
    include: { usuario: { select: { nombre: true, apellido: true } } },
  });

export const listar = () =>
  prisma.configuracion.findMany({
    orderBy: { clave: 'asc' },
    include: { usuario: { select: { nombre: true, apellido: true } } },
  });

/**
 * Escribe el valor dejando constancia de quién y cuándo.
 *
 * `upsert` y no `update`: una instalación puede no tener todavía la fila, y
 * fallar por eso obligaría a sembrar antes de poder configurar.
 */
export const guardar = (clave: string, valor: string, idUsuario: number, descripcion?: string) =>
  prisma.configuracion.upsert({
    where: { clave },
    update: { valor, id_usuario: idUsuario, actualizado_en: new Date() },
    create: { clave, valor, descripcion, id_usuario: idUsuario },
  });

export type ConfiguracionConsultada = Awaited<ReturnType<typeof listar>>[number];
