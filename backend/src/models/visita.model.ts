import { prisma } from '../config/prisma.js';

/** Capa Model — clase de análisis tblVisita (RF-WEB-03). */

export const registrar = (ruta: string | null) =>
  prisma.visita.create({ data: { ruta }, select: { id_visita: true } });

export const contar = () => prisma.visita.count();

/** Primera visita registrada: permite decir desde cuándo se acumula el total. */
export const primera = () =>
  prisma.visita.findFirst({ orderBy: { fecha: 'asc' }, select: { fecha: true } });
