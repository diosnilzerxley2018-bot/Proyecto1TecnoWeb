import * as clienteModel from '../models/cliente.model.js';
import * as empleadoModel from '../models/empleado.model.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * Comprobación de la especialización del usuario autenticado.
 *
 * El modelo de clases define Usuario como supertipo con Empleado y Cliente
 * como especializaciones, y siete claves foráneas del esquema apuntan a una u
 * otra tabla. El permiso dice qué puede hacer un usuario; el subtipo dice si
 * la operación puede siquiera registrarse a su nombre. Son comprobaciones
 * distintas y ambas hacen falta.
 *
 * Empleado y Cliente comparten identificador con Usuario, de modo que el id
 * devuelto sirve directamente como clave foránea.
 */

export async function exigirEmpleado(idUsuario: number, accion: string): Promise<number> {
  const empleado = await empleadoModel.buscarPorId(idUsuario);
  if (!empleado) {
    throw new ErrorApp(403, `Solo el personal interno puede ${accion}`);
  }
  return empleado.id_empleado;
}

export async function exigirCliente(idUsuario: number, accion: string): Promise<number> {
  const cliente = await clienteModel.buscarPorId(idUsuario);
  if (!cliente) {
    throw new ErrorApp(403, `Solo los clientes registrados pueden ${accion}`);
  }
  return cliente.id_cliente;
}

/**
 * Lo que nadie decide sobre su propia cuenta: el rol, los permisos y el estado.
 *
 * El perfil no da entrada a esos campos (ver `perfil.service`), pero la
 * gestión de usuarios sí, y el administrador llegaba a los suyos por ella:
 * podía darse de baja, bajarse de rol o quitarse el permiso de administrar
 * usuarios. Si era el único, el sistema quedaba sin nadie capaz de
 * revertirlo, la misma trampa que `bloqueo.service` evita con los bloqueos.
 * Esos cambios se los hace otro administrador.
 */
export function exigirCuentaAjena(idAfectado: number, idActor: number, cambio: string): void {
  if (idAfectado === idActor) {
    throw new ErrorApp(403, `No puede ${cambio}. Si hace falta, pídaselo a otro administrador.`);
  }
}
