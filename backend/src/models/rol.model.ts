import { prisma } from '../config/prisma.js';

/** Capa Model — clase de análisis tblRol. */

export const listar = () =>
  prisma.rol.findMany({
    orderBy: { id_rol: 'asc' },
    select: {
      id_rol: true,
      nombre: true,
      _count: { select: { usuario: true } },
      rol_permiso: { select: { permiso: { select: { id_permiso: true, nombre: true } } } },
    },
  });

export const buscarPorId = (id: number) =>
  prisma.rol.findUnique({
    where: { id_rol: id },
    select: {
      id_rol: true,
      nombre: true,
      _count: { select: { usuario: true } },
      rol_permiso: { select: { permiso: { select: { id_permiso: true, nombre: true } } } },
    },
  });

export const buscarPorNombre = (nombre: string) =>
  prisma.rol.findUnique({ where: { nombre }, select: { id_rol: true, nombre: true } });

export const crear = (nombre: string) => prisma.rol.create({ data: { nombre } });

export const renombrar = (id: number, nombre: string) =>
  prisma.rol.update({ where: { id_rol: id }, data: { nombre } });

/**
 * Reemplaza los permisos de un rol.
 * CU-SEG-03: "Si se retira un permiso de un rol, el sistema retira también
 * ese permiso de los usuarios que lo tuvieran habilitado."
 */
export const reemplazarPermisos = (idRol: number, idsPermiso: number[]) =>
  prisma.$transaction(async (tx) => {
    const actuales = await tx.rol_permiso.findMany({ where: { id_rol: idRol } });
    const aRetirar = actuales.filter((rp) => !idsPermiso.includes(rp.id_permiso));

    if (aRetirar.length > 0) {
      const ids = aRetirar.map((rp) => rp.id_rol_permiso);
      // Cascada explícita hacia los usuarios que tenían el permiso habilitado
      await tx.usuario_rol_permiso.deleteMany({ where: { id_rol_permiso: { in: ids } } });
      await tx.rol_permiso.deleteMany({ where: { id_rol_permiso: { in: ids } } });
    }

    const yaExisten = actuales.map((rp) => rp.id_permiso);
    const aAgregar = idsPermiso.filter((id) => !yaExisten.includes(id));
    if (aAgregar.length > 0) {
      await tx.rol_permiso.createMany({
        data: aAgregar.map((id_permiso) => ({ id_rol: idRol, id_permiso })),
      });
    }
  });
