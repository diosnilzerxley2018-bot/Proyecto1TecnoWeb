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
