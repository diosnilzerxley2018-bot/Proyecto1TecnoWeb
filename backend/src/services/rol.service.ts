import * as rolModel from '../models/rol.model.js';
import * as permisoModel from '../models/permiso.model.js';
import { ErrorApp } from '../errors/error-app.js';
import { ROL_CLIENTE } from '../config/dominio.js';
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

  // Sus permisos sí se pueden cambiar; su nombre no (ver `exigirQueNoSeaDelSistema`).
  if (nombre !== rol.nombre) exigirQueNoSeaDelSistema(rol.nombre, 'renombrar');

  await rolModel.renombrar(id, nombre);
  await rolModel.reemplazarPermisos(id, idsPermiso);
  return obtener(id);
}

/**
 * CU-SEG-03 — elimina un rol.
 *
 * Solo se admite si **ningún usuario lo tiene**. Borrar el rol de alguien lo
 * dejaría sin rol —la columna no admite nulo— o obligaría a elegirle otro por
 * él, y esa decisión es del administrador, no del sistema: se le pide que
 * reasigne primero y el mensaje dice a cuántos.
 */
export async function eliminar(id: number): Promise<void> {
  const rol = await rolModel.buscarPorId(id);
  if (!rol) throw new ErrorApp(404, 'Rol no encontrado');

  exigirQueNoSeaDelSistema(rol.nombre, 'eliminar');

  const asignados = rol._count.usuario;
  if (asignados > 0) {
    throw new ErrorApp(
      409,
      `El rol ${rol.nombre} tiene ${asignados} usuario(s) asignado(s). ` +
        'Asígneles otro rol antes de eliminarlo.',
    );
  }

  await rolModel.eliminar(id);
}

/**
 * Roles de los que el código depende **por su nombre**.
 *
 * El autorregistro busca el rol `Cliente` por nombre para dárselo a quien se
 * registra (`auth.service`), y la frontera entre personal y cliente se decide
 * comparando con ese mismo nombre (`esPersonalInterno`). Borrarlo o
 * renombrarlo no da error en el momento: rompe en silencio el registro de
 * clientes nuevos y convierte a los existentes en «personal interno».
 */
function exigirQueNoSeaDelSistema(nombreRol: string, accion: 'eliminar' | 'renombrar'): void {
  if (nombreRol === ROL_CLIENTE) {
    throw new ErrorApp(
      409,
      `No se puede ${accion} el rol ${ROL_CLIENTE}: el sistema lo usa para el ` +
        'registro de clientes. Sus permisos sí pueden modificarse.',
    );
  }
}
