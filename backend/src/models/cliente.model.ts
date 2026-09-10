import { prisma } from '../config/prisma.js';
import { recorte, type DatosPaginacion } from '../dtos/paginacion.dto.js';

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

/** Una página de clientes y cuántos hay en total (H7). */
export const listar = (filtro: FiltroClientes) => {
  const where = {
    usuario: {
      ...(filtro.incluirInactivos ? {} : { activo: true }),
      ...(filtro.termino
        ? {
            OR: [
              { nombre: { contains: filtro.termino, mode: 'insensitive' as const } },
              { apellido: { contains: filtro.termino, mode: 'insensitive' as const } },
              { email: { contains: filtro.termino, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
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
