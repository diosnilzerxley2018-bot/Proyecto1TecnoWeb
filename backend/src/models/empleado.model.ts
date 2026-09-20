import { prisma } from '../config/prisma.js';

/** Capa Model — clase de análisis tblEmpleado (especialización de Usuario). */

const CON_CARGO_Y_USUARIO = {
  id_empleado: true,
  cargo: { select: { nombre: true } },
  usuario: { select: { nombre: true, apellido: true, activo: true } },
} as const;

export const buscarPorId = (idEmpleado: number) =>
  prisma.empleado.findUnique({
    where: { id_empleado: idEmpleado },
    select: CON_CARGO_Y_USUARIO,
  });

/** Personal activo de un cargo determinado, p. ej. los repartidores. */
export const listarPorCargo = (nombreCargo: string) =>
  prisma.empleado.findMany({
    where: { cargo: { nombre: nombreCargo }, usuario: { activo: true } },
    select: CON_CARGO_Y_USUARIO,
    orderBy: { usuario: { apellido: 'asc' } },
  });

/** Turno actual del empleado (RF-PED-07). */
export const obtenerDisponibilidad = (idEmpleado: number) =>
  prisma.empleado.findUniqueOrThrow({
    where: { id_empleado: idEmpleado },
    select: { disponible: true },
  });

/** Marca al empleado de turno o fuera de turno (RF-PED-07). */
export const cambiarDisponibilidad = (idEmpleado: number, disponible: boolean) =>
  prisma.empleado.update({
    where: { id_empleado: idEmpleado },
    data: { disponible },
    select: { id_empleado: true, disponible: true },
  });

/**
 * Repartidores de turno con su carga actual, del menos cargado al más cargado.
 *
 * La carga es la cantidad de pedidos **en curso**: los entregados y los
 * cancelados no ocupan a nadie. El desempate por identificador es arbitrario
 * pero estable, de modo que la sugerencia no cambia entre dos consultas
 * seguidas si nada cambió.
 *
 * No se ordena por cercanía porque el sistema no sabe dónde está cada
 * repartidor: no hay rastreo de su ubicación. Un criterio por distancia sería
 * inventado.
 */
export const repartidoresPorCarga = async (nombreCargo: string, enCurso: string[]) => {
  const repartidores = await prisma.empleado.findMany({
    where: { cargo: { nombre: nombreCargo }, usuario: { activo: true } },
    select: {
      id_empleado: true,
      disponible: true,
      usuario: { select: { nombre: true, apellido: true, telefono: true } },
      pedido: {
        where: { estado_pedido: { in: enCurso } },
        select: { id_pedido: true },
      },
    },
    orderBy: { usuario: { apellido: 'asc' } },
  });

  return repartidores
    .map((r) => ({
      idEmpleado: r.id_empleado,
      nombreCompleto: `${r.usuario.nombre} ${r.usuario.apellido}`,
      telefono: r.usuario.telefono,
      disponible: r.disponible,
      entregasEnCurso: r.pedido.length,
    }))
    .sort((a, b) => a.entregasEnCurso - b.entregasEnCurso || a.idEmpleado - b.idEmpleado);
};

export type EmpleadoConCargo = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;
