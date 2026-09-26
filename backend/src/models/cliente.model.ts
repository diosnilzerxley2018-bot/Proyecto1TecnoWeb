import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { recorte, type DatosPaginacion } from '../dtos/paginacion.dto.js';
import { contieneTodas, limite } from './busqueda-texto.js';

/** Capa Model — clase de análisis tblCliente (especialización de Usuario). */

export const buscarPorId = (idCliente: number) =>
  prisma.cliente.findUnique({
    where: { id_cliente: idCliente },
    select: { id_cliente: true },
  });

/* ------------------------------------------------------------------ */
/* CU-VEN-02 — Gestionar Cliente                                       */
/* ------------------------------------------------------------------ */

const CAMPOS = {
  id_cliente: true,
  preferencia_alimentaria: true,
  restriccion_dietetica: true,
  usuario: {
    select: {
      nombre: true,
      apellido: true,
      email: true,
      telefono: true,
      nombre_usuario: true,
      activo: true,
      fecha_registro: true,
    },
  },
  _count: { select: { pedido: true, venta: true } },
} as const;

export interface FiltroClientes extends DatosPaginacion {
  termino?: string;
  incluirInactivos?: boolean;
}

/**
 * Clientes cuyo nombre, apellido o correo contienen todas las palabras
 * buscadas, sin importar tildes ni mayúsculas.
 *
 * Antes se comparaba la frase entera contra cada columna, y escribir el
 * nombre completo —«camila cliente»— no encontraba a nadie.
 */
export async function idsQueCoinciden(termino: string, tope?: number): Promise<number[]> {
  const filas = await prisma.$queryRaw<{ id_cliente: number }[]>`
    SELECT c.id_cliente FROM cliente c
    JOIN usuario u ON u.id_usuario = c.id_cliente
    WHERE ${contieneTodas(Prisma.sql`concat_ws(' ', u.nombre, u.apellido, u.email)`, termino)}
    ORDER BY u.apellido, u.nombre
    ${limite(tope)}`;
  return filas.map((f) => f.id_cliente);
}

/** Una página de clientes y cuántos hay en total (H7). */
export const listar = async (filtro: FiltroClientes) => {
  const where: Prisma.clienteWhereInput = {
    ...(filtro.termino ? { id_cliente: { in: await idsQueCoinciden(filtro.termino) } } : {}),
    ...(filtro.incluirInactivos ? {} : { usuario: { activo: true } }),
  };

  return prisma.$transaction([
    prisma.cliente.findMany({
      where,
      select: CAMPOS,
      orderBy: { usuario: { apellido: 'asc' } },
      ...recorte(filtro),
    }),
    prisma.cliente.count({ where }),
  ]);
};

/** Los primeros clientes que coinciden con lo buscado, para el buscador general. */
export async function coincidencias(termino: string, tope: number) {
  return prisma.cliente.findMany({
    where: { id_cliente: { in: await idsQueCoinciden(termino, tope) } },
    select: CAMPOS,
    orderBy: { usuario: { apellido: 'asc' } },
  });
}

export const buscarDetalle = (idCliente: number) =>
  prisma.cliente.findUnique({ where: { id_cliente: idCliente }, select: CAMPOS });

/** Preferencias alimentarias y restricciones dietéticas del cliente. */
export const actualizarPreferencias = (
  idCliente: number,
  datos: { preferenciaAlimentaria?: string | null; restriccionDietetica?: string | null },
) =>
  prisma.cliente.update({
    where: { id_cliente: idCliente },
    data: {
      ...(datos.preferenciaAlimentaria !== undefined
        ? { preferencia_alimentaria: datos.preferenciaAlimentaria }
        : {}),
      ...(datos.restriccionDietetica !== undefined
        ? { restriccion_dietetica: datos.restriccionDietetica }
        : {}),
    },
    select: { id_cliente: true },
  });

export type ClienteConsultado = NonNullable<Awaited<ReturnType<typeof buscarDetalle>>>;
