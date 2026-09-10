import { prisma } from '../config/prisma.js';
import { recorte, type DatosPaginacion } from '../dtos/paginacion.dto.js';

/** Capa Model — corresponde a la clase de análisis tblUsuario. */

export const buscarPorNombreUsuario = (nombreUsuario: string) =>
  prisma.usuario.findUnique({
    where: { nombre_usuario: nombreUsuario },
    include: { rol: true },
  });

export const buscarPorId = (id: number) =>
  prisma.usuario.findUnique({
    where: { id_usuario: id },
    include: { rol: true, empleado: { include: { cargo: true } }, cliente: true },
  });

/**
 * Estado de la cuenta, sin relaciones.
 *
 * La consulta más liviana posible sobre la clave primaria: la ejecuta cada
 * petición autenticada, así que trae tres booleanos y nada más.
 */
export const estadoDeCuenta = (id: number) =>
  prisma.usuario.findUnique({
    where: { id_usuario: id },
    // `fecha_bloqueo` viaja con los dos booleanos porque sin ella no se puede
    // saber si el bloqueo ya caducó, y quien pregunta por el estado de la
    // cuenta necesita esa respuesta, no la del momento en que se bloqueó.
    select: { activo: true, bloqueado: true, fecha_bloqueo: true },
  });

/** Una página de usuarios y cuántos hay en total (H7). */
export const listar = (filtro: DatosPaginacion) =>
  prisma.$transaction([
    prisma.usuario.findMany({
      orderBy: { id_usuario: 'asc' },
      select: {
        id_usuario: true,
        nombre: true,
        apellido: true,
        nombre_usuario: true,
        email: true,
        activo: true,
        bloqueado: true,
        rol: { select: { nombre: true } },
      },
      ...recorte(filtro),
    }),
    prisma.usuario.count(),
  ]);

/**
 * Datos de la especializacion, segun el modelo de clases:
 * Usuario es supertipo de Empleado y Cliente.
 */
export type Subtipo =
  | { tipo: 'empleado'; idCargo: number; fechaIngreso?: Date }
  | { tipo: 'cliente'; preferenciaAlimentaria?: string | null; restriccionDietetica?: string | null };

export interface DatosNuevoUsuario {
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string | null;
  nombreUsuario: string;
  contrasenaHash: string;
  idRol: number;
  subtipo: Subtipo;
}

/**
 * Crea el usuario y su fila de subtipo en una sola transaccion.
 *
 * Es obligatorio que ambas existan: siete claves foraneas del esquema
 * apuntan a `empleado` o a `cliente`. Un usuario sin subtipo no podria
 * registrar ventas, notas de inventario ni pedidos.
 */
export const crear = (datos: DatosNuevoUsuario) =>
  prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        nombre: datos.nombre,
        apellido: datos.apellido,
        email: datos.email,
        telefono: datos.telefono ?? null,
        nombre_usuario: datos.nombreUsuario,
        contrasena_hash: datos.contrasenaHash,
        id_rol: datos.idRol,
      },
    });

    if (datos.subtipo.tipo === 'empleado') {
      await tx.empleado.create({
        data: {
          id_empleado: usuario.id_usuario,
          id_cargo: datos.subtipo.idCargo,
          ...(datos.subtipo.fechaIngreso ? { fecha_ingreso: datos.subtipo.fechaIngreso } : {}),
        },
      });
    } else {
      await tx.cliente.create({
        data: {
          id_cliente: usuario.id_usuario,
          preferencia_alimentaria: datos.subtipo.preferenciaAlimentaria ?? null,
          restriccion_dietetica: datos.subtipo.restriccionDietetica ?? null,
        },
      });
    }

    /**
     * Permisos del rol, habilitados para el usuario.
     *
     * `requierePermiso` consulta `usuario_rol_permiso`, no el rol: la tabla
     * intermedia es lo que permite quitarle un permiso a una persona sin
     * cambiarle el rol (CU-SEG-04). Sin estas filas el usuario podía iniciar
     * sesión y recibía 403 en todo, que es como quedaron los creados desde la
     * aplicación antes de esta corrección.
     *
     * Va en la misma transacción que el alta: un usuario sin permisos no es un
     * usuario a medias, es uno inservible.
     */
    const permisosDelRol = await tx.rol_permiso.findMany({
      where: { id_rol: datos.idRol },
      select: { id_rol_permiso: true },
    });

    if (permisosDelRol.length > 0) {
      await tx.usuario_rol_permiso.createMany({
        data: permisosDelRol.map((rp) => ({
          id_usuario: usuario.id_usuario,
          id_rol_permiso: rp.id_rol_permiso,
        })),
      });
    }

    return usuario;
  });

export const actualizar = (
  id: number,
  datos: Partial<{
    nombre: string;
    apellido: string;
    email: string;
    telefono: string | null;
    id_rol: number;
    activo: boolean;
  }>,
) =>
  prisma.usuario.update({
    where: { id_usuario: id },
    data: datos,
    include: { rol: true },
  });

/** Baja lógica: RF-SEG-05 exige dar de baja, no eliminar. */
export const darDeBaja = (id: number) =>
  prisma.usuario.update({ where: { id_usuario: id }, data: { activo: false } });

export const registrarIntentoFallido = (id: number, intentos: number, bloquear: boolean) =>
  prisma.usuario.update({
    where: { id_usuario: id },
    data: {
      intentos_fallidos: intentos,
      bloqueado: bloquear,
      fecha_bloqueo: bloquear ? new Date() : null,
    },
  });

/**
 * Cierra un inicio de sesión correcto.
 *
 * Reinicia el contador de intentos y sella la fecha en un solo `UPDATE`: son
 * dos consecuencias del mismo hecho, y separarlas abriría la posibilidad de
 * que una se aplique y la otra no.
 */
export const registrarAccesoExitoso = (id: number) =>
  prisma.usuario.update({
    where: { id_usuario: id },
    data: { intentos_fallidos: 0, ultimo_acceso: new Date() },
  });

/** Cambia el hash de la contraseña. No toca ningún otro campo. */
export const cambiarContrasena = (id: number, hash: string) =>
  prisma.usuario.update({
    where: { id_usuario: id },
    data: { contrasena_hash: hash },
    select: { id_usuario: true },
  });

export const desbloquear = (id: number) =>
  prisma.usuario.update({
    where: { id_usuario: id },
    data: { bloqueado: false, fecha_bloqueo: null, intentos_fallidos: 0 },
  });

export const existeNombreUsuarioOEmail = (nombreUsuario: string, email: string, excluirId?: number) =>
  prisma.usuario.findFirst({
    where: {
      OR: [{ nombre_usuario: nombreUsuario }, { email }],
      ...(excluirId ? { NOT: { id_usuario: excluirId } } : {}),
    },
    select: { id_usuario: true },
  });
