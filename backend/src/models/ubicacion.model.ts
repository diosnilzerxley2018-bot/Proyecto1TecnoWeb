import { prisma } from '../config/prisma.js';
import type { ClientePrisma } from './stock.model.js';

/** Capa Model — clase de análisis tblUbicacion (CU-PED-03 Gestionar Ubicación). */

const CAMPOS = {
  id_ubicacion: true,
  calle: true,
  numero: true,
  referencia: true,
  latitud: true,
  longitud: true,
  etiqueta: true,
  vigente: true,
  fecha_registro: true,
} as const;

/**
 * Direcciones que se le ofrecen al cliente al pedir.
 *
 * Solo las vigentes: las reemplazadas siguen en la tabla porque los pedidos
 * que las usaron las apuntan, pero ya no se proponen.
 */
export const listarDeCliente = (idCliente: number, tx: ClientePrisma = prisma) =>
  tx.ubicacion.findMany({
    where: { id_cliente: idCliente, vigente: true },
    select: CAMPOS,
    orderBy: { fecha_registro: 'asc' },
  });

export const buscarPorId = (idUbicacion: number, tx: ClientePrisma = prisma) =>
  tx.ubicacion.findUnique({
    where: { id_ubicacion: idUbicacion },
    select: { ...CAMPOS, id_cliente: true },
  });

export const crear = (
  tx: ClientePrisma,
  datos: {
    calle: string;
    numero: string | null;
    referencia: string;
    latitud: number | null;
    longitud: number | null;
    etiqueta: string | null;
    idCliente: number | null;
  },
) =>
  tx.ubicacion.create({
    data: {
      calle: datos.calle,
      numero: datos.numero,
      referencia: datos.referencia,
      latitud: datos.latitud,
      longitud: datos.longitud,
      etiqueta: datos.etiqueta,
      id_cliente: datos.idCliente,
    },
    select: CAMPOS,
  });

/**
 * Archiva una dirección sin borrarla.
 *
 * Nunca se elimina: los pedidos entregados en ella la apuntan, y borrarla
 * dejaría el historial sin destino. Deja de ofrecerse, nada más.
 */
export const archivar = (idUbicacion: number, tx: ClientePrisma = prisma) =>
  tx.ubicacion.update({
    where: { id_ubicacion: idUbicacion },
    data: { vigente: false },
    select: { id_ubicacion: true },
  });

/** Cuántas direcciones vigentes tiene, para no dejar que se acumulen sin fin. */
export const contarVigentes = (idCliente: number, tx: ClientePrisma = prisma) =>
  tx.ubicacion.count({ where: { id_cliente: idCliente, vigente: true } });

export type UbicacionConsultada = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;
