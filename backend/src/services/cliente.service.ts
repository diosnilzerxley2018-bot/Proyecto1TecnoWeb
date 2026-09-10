import * as clienteModel from '../models/cliente.model.js';
import { pagina, type Pagina } from '../dtos/paginacion.dto.js';
import * as usuarioModel from '../models/usuario.model.js';
import type { ClienteConsultado } from '../models/cliente.model.js';
import type {
  ClienteDTO,
  DatosActualizarCliente,
  DatosActualizarPerfil,
  FiltroClientesDTO,
} from '../dtos/cliente.dto.js';
import { exigirCliente, exigirEmpleado } from './actor.service.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * CU-VEN-02 — Gestionar Cliente.
 *
 * Tiene dos actores con alcances distintos: el empleado administra las fichas
 * de todos los clientes, y el cliente modifica únicamente la suya. El
 * autorregistro desde el portal ya lo resuelve CU-SEG-01 en `auth.service`.
 */

const ACCION_PERSONAL = 'gestionar las fichas de clientes';

function aDTO(cliente: ClienteConsultado): ClienteDTO {
  return {
    id: cliente.id_cliente,
    nombre: cliente.usuario.nombre,
    apellido: cliente.usuario.apellido,
    nombreCompleto: `${cliente.usuario.nombre} ${cliente.usuario.apellido}`,
    email: cliente.usuario.email,
    telefono: cliente.usuario.telefono,
    nombreUsuario: cliente.usuario.nombre_usuario,
    activo: cliente.usuario.activo,
    fechaRegistro: cliente.usuario.fecha_registro.toISOString(),
    preferenciaAlimentaria: cliente.preferencia_alimentaria,
    restriccionDietetica: cliente.restriccion_dietetica,
    cantidadPedidos: cliente._count.pedido,
    cantidadVentas: cliente._count.venta,
  };
}

async function exigirFicha(idCliente: number): Promise<ClienteConsultado> {
  const cliente = await clienteModel.buscarDetalle(idCliente);
  if (!cliente) throw new ErrorApp(404, 'El cliente no existe');
  return cliente;
}

/**
 * CU-VEN-02: "El sistema valida que el correo electrónico no se encuentre
 * registrado." Se comprueba antes para devolver el mensaje del caso de uso en
 * lugar de un error de índice único.
 */
async function exigirCorreoLibre(email: string, idUsuario: number): Promise<void> {
  const existente = await usuarioModel.existeNombreUsuarioOEmail('', email, idUsuario);
  if (existente) {
    throw new ErrorApp(409, 'El correo electrónico ya está registrado');
  }
}

/**
 * Aplica los cambios sobre las dos tablas de la especialización: los datos
 * personales viven en `usuario` y las preferencias en `cliente`.
 */
async function aplicarCambios(
  idCliente: number,
  datos: DatosActualizarPerfil & { activo?: boolean },
): Promise<void> {
  if (datos.email !== undefined) await exigirCorreoLibre(datos.email, idCliente);

  const cambiosUsuario = {
    ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
    ...(datos.apellido !== undefined ? { apellido: datos.apellido } : {}),
    ...(datos.email !== undefined ? { email: datos.email } : {}),
    ...(datos.telefono !== undefined ? { telefono: datos.telefono ?? null } : {}),
    ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
  };

  if (Object.keys(cambiosUsuario).length > 0) {
    await usuarioModel.actualizar(idCliente, cambiosUsuario);
  }

  if (
    datos.preferenciaAlimentaria !== undefined ||
    datos.restriccionDietetica !== undefined
  ) {
    await clienteModel.actualizarPreferencias(idCliente, {
      preferenciaAlimentaria: datos.preferenciaAlimentaria,
      restriccionDietetica: datos.restriccionDietetica,
    });
  }
}

/* --------------------------- Lado del personal --------------------------- */

export async function listar(
  idUsuario: number,
  filtro: FiltroClientesDTO,
): Promise<Pagina<ClienteDTO>> {
  await exigirEmpleado(idUsuario, ACCION_PERSONAL);
  const [clientes, total] = await clienteModel.listar(filtro);
  return pagina(clientes.map(aDTO), total, filtro);
}

export async function obtener(idUsuario: number, idCliente: number): Promise<ClienteDTO> {
  await exigirEmpleado(idUsuario, ACCION_PERSONAL);
  return aDTO(await exigirFicha(idCliente));
}

export async function actualizar(
  idUsuario: number,
  idCliente: number,
  datos: DatosActualizarCliente,
): Promise<ClienteDTO> {
  await exigirEmpleado(idUsuario, ACCION_PERSONAL);
  await exigirFicha(idCliente);
  await aplicarCambios(idCliente, datos);
  return aDTO(await exigirFicha(idCliente));
}

/* -------------------------- Lado del propio cliente ---------------------- */

export async function obtenerPerfil(idUsuario: number): Promise<ClienteDTO> {
  const idCliente = await exigirCliente(idUsuario, 'consultar su ficha de cliente');
  return aDTO(await exigirFicha(idCliente));
}

/**
 * CU-VEN-02, variación: "El cliente puede modificar sus propios datos, pero no
 * los de otros clientes."
 *
 * El identificador sale de la sesión y nunca de la ruta: así no existe forma de
 * apuntar a la ficha de otro. Tampoco se admite `activo`, porque dar de baja
 * una cuenta es decisión del personal.
 */
export async function actualizarPerfil(
  idUsuario: number,
  datos: DatosActualizarPerfil,
): Promise<ClienteDTO> {
  const idCliente = await exigirCliente(idUsuario, 'modificar su ficha de cliente');
  await aplicarCambios(idCliente, datos);
  return aDTO(await exigirFicha(idCliente));
}
