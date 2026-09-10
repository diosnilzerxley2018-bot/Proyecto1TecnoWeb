import { prisma } from '../config/prisma.js';

/** Capa Model — clase de análisis tblCargo. */

export const listar = () =>
  prisma.cargo.findMany({
    orderBy: { nombre: 'asc' },
    select: { id_cargo: true, nombre: true, salario_base: true },
  });

export const buscarPorId = (id: number) =>
  prisma.cargo.findUnique({ where: { id_cargo: id }, select: { id_cargo: true } });
