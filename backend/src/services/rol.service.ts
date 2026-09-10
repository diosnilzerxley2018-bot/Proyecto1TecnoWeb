import * as rolModel from '../models/rol.model.js';
import * as permisoModel from '../models/permiso.model.js';
import { ErrorApp } from '../errors/error-app.js';
import type { RolDTO, PermisoDTO } from '../dtos/rol.dto.js';

/** CU-SEG-03 Gestionar Rol y Permisos */

/**
 * Forma que devuelven las consultas de rol.model.
 * Se declara de forma explícita para no depender de inferencias frágiles
 * ni recurrir a aserciones de tipo.
 */
interface RolConsultado {
  id_rol: number;
  nombre: string;
  _count: { usuario: number };
  rol_permiso: Array<{ permiso: { id_permiso: number; nombre: string } }>;
}

function aDTO(rol: RolConsultado): RolDTO {
  return {
    id: rol.id_rol,
    nombre: rol.nombre,
    cantidadUsuarios: rol._count.usuario,
    permisos: rol.rol_permiso.map((rp) => ({
      id: rp.permiso.id_permiso,
      nombre: rp.permiso.nombre,
    })),
  };
}

export async function listar(): Promise<RolDTO[]> {
  const roles = await rolModel.listar();
  return roles.map(aDTO);
}

export async function obtener(id: number): Promise<RolDTO> {
  const rol = await rolModel.buscarPorId(id);
  if (!rol) throw new ErrorApp(404, 'Rol no encontrado');
  return aDTO(rol);
}

export async function listarPermisos(): Promise<PermisoDTO[]> {
  const permisos = await permisoModel.listarPermisos();
  return permisos.map((p) => ({ id: p.id_permiso, nombre: p.nombre }));
}

export async function crear(nombre: string, idsPermiso: number[]): Promise<RolDTO> {
  const existente = await rolModel.buscarPorNombre(nombre);
  if (existente) throw new ErrorApp(409, 'Ya existe un rol con ese nombre');

  const creado = await rolModel.crear(nombre);
  if (idsPermiso.length > 0) {
    await rolModel.reemplazarPermisos(creado.id_rol, idsPermiso);
  }
  return obtener(creado.id_rol);
}

export async function actualizar(
  id: number,
  nombre: string,
  idsPermiso: number[],
): Promise<RolDTO> {
  const rol = await rolModel.buscarPorId(id);
  if (!rol) throw new ErrorApp(404, 'Rol no encontrado');

  const duplicado = await rolModel.buscarPorNombre(nombre);
  if (duplicado && duplicado.id_rol !== id) {
    throw new ErrorApp(409, 'Ya existe otro rol con ese nombre');
  }

  await rolModel.renombrar(id, nombre);
  await rolModel.reemplazarPermisos(id, idsPermiso);
  return obtener(id);
}
