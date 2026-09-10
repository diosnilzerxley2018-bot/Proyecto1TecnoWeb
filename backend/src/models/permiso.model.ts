import { prisma } from '../config/prisma.js';

/** Capa Model — clases de análisis tblPermiso, tblRolPermiso y tblUsuarioRolPermiso. */

/** Permisos efectivamente habilitados a un usuario. Base del RNF-SEG-04. */
export const permisosDeUsuario = async (idUsuario: number): Promise<string[]> => {
  const filas = await prisma.usuario_rol_permiso.findMany({
    where: { id_usuario: idUsuario },
    select: { rol_permiso: { select: { permiso: { select: { nombre: true } } } } },
  });
  return filas.map((f) => f.rol_permiso.permiso.nombre);
};

/** Todos los permisos que el rol del usuario admite, con el indicador de habilitado. */
export const permisosDisponiblesParaUsuario = async (idUsuario: number, idRol: number) => {
  const delRol = await prisma.rol_permiso.findMany({
    where: { id_rol: idRol },
    select: { id_rol_permiso: true, permiso: { select: { nombre: true } } },
    orderBy: { id_rol_permiso: 'asc' },
  });
  const habilitados = await prisma.usuario_rol_permiso.findMany({
    where: { id_usuario: idUsuario },
    select: { id_rol_permiso: true },
  });
  const set = new Set(habilitados.map((h) => h.id_rol_permiso));
  return delRol.map((rp) => ({
    idRolPermiso: rp.id_rol_permiso,
    permiso: rp.permiso.nombre,
    habilitado: set.has(rp.id_rol_permiso),
  }));
};

/** Reemplaza los permisos habilitados de un usuario en una sola transacción. */
export const reemplazarPermisosDeUsuario = (idUsuario: number, idsRolPermiso: number[]) =>
  prisma.$transaction([
    prisma.usuario_rol_permiso.deleteMany({ where: { id_usuario: idUsuario } }),
    prisma.usuario_rol_permiso.createMany({
      data: idsRolPermiso.map((id) => ({ id_usuario: idUsuario, id_rol_permiso: id })),
    }),
  ]);

export const listarPermisos = () =>
  prisma.permiso.findMany({ orderBy: { id_permiso: 'asc' } });

export const idsRolPermisoValidos = async (idRol: number, ids: number[]) => {
  const validos = await prisma.rol_permiso.findMany({
    where: { id_rol: idRol, id_rol_permiso: { in: ids } },
    select: { id_rol_permiso: true },
  });
  return validos.map((v) => v.id_rol_permiso);
};

/** Todos los vínculos rol-permiso de un rol. Se usa al autorregistrar un cliente. */
export const idsRolPermisoDeRol = async (idRol: number): Promise<number[]> => {
  const filas = await prisma.rol_permiso.findMany({
    where: { id_rol: idRol },
    select: { id_rol_permiso: true },
  });
  return filas.map((f) => f.id_rol_permiso);
};
