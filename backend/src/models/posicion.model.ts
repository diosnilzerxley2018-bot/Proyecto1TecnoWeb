import { prisma } from '../config/prisma.js';
import type { ClientePrisma } from './stock.model.js';

/**
 * Capa Model — posición en vivo del repartidor (tabla `posicion_repartidor`).
 *
 * Una fila por repartidor, que se pisa: no se guarda el recorrido.
 */

export const guardar = (
  idEmpleado: number,
  datos: { latitud: number; longitud: number; precision: number | null },
) => {
  const campos = {
    latitud: datos.latitud,
    longitud: datos.longitud,
    precision_m: datos.precision,
    actualizada_en: new Date(),
  };
  return prisma.posicion_repartidor.upsert({
    where: { id_empleado: idEmpleado },
    create: { id_empleado: idEmpleado, ...campos },
    update: campos,
  });
};

export const deEmpleado = (idEmpleado: number) =>
  prisma.posicion_repartidor.findUnique({ where: { id_empleado: idEmpleado } });

/** Olvida la posición. `deleteMany` no falla si no había ninguna. */
export const borrar = (idEmpleado: number, tx: ClientePrisma = prisma) =>
  tx.posicion_repartidor.deleteMany({ where: { id_empleado: idEmpleado } });
