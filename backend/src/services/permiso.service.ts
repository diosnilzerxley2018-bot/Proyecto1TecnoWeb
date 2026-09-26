import * as permisoModel from '../models/permiso.model.js';
import * as usuarioModel from '../models/usuario.model.js';
import { ErrorApp } from '../errors/error-app.js';
import { exigirCuentaAjena } from './actor.service.js';
import type { PermisoUsuarioDTO } from '../dtos/rol.dto.js';

/** CU-SEG-04 Asignar Permisos a Usuario */

export async function permisosDeUsuario(idUsuario: number): Promise<PermisoUsuarioDTO[]> {
  const u = await usuarioModel.buscarPorId(idUsuario);
  if (!u) throw new ErrorApp(404, 'Usuario no encontrado');
  return permisoModel.permisosDisponiblesParaUsuario(idUsuario, u.id_rol);
}

/**
 * Habilita al usuario un subconjunto de los permisos definidos para su rol.
 * Solo se aceptan identificadores que pertenezcan al rol del usuario.
 */
export async function asignarPermisos(
  idUsuario: number,
  idsRolPermiso: number[],
  idActor: number,
): Promise<PermisoUsuarioDTO[]> {
  exigirCuentaAjena(idUsuario, idActor, 'cambiar sus propios permisos');
  const u = await usuarioModel.buscarPorId(idUsuario);
  if (!u) throw new ErrorApp(404, 'Usuario no encontrado');

  const validos = await permisoModel.idsRolPermisoValidos(u.id_rol, idsRolPermiso);
  if (validos.length !== idsRolPermiso.length) {
    throw new ErrorApp(400, 'Alguno de los permisos no corresponde al rol del usuario');
  }

  await permisoModel.reemplazarPermisosDeUsuario(idUsuario, validos);
  return permisoModel.permisosDisponiblesParaUsuario(idUsuario, u.id_rol);
}
