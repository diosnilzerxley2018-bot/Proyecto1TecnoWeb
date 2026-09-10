import * as usuarioModel from '../models/usuario.model.js';
import { pagina, type DatosPaginacion, type Pagina } from '../dtos/paginacion.dto.js';
import * as rolModel from '../models/rol.model.js';
import * as cargoModel from '../models/cargo.model.js';
import { hashearContrasena } from '../utils/hash.js';
import { ErrorApp } from '../errors/error-app.js';
import { esPersonalInterno } from '../config/dominio.js';
import type { Subtipo } from '../models/usuario.model.js';
import type { UsuarioListaDTO, UsuarioDetalleDTO } from '../dtos/usuario.dto.js';

/** CU-SEG-02 Gestionar Usuario */

export interface DatosCrear {
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string | null;
  nombreUsuario: string;
  contrasena: string;
  idRol: number;
  /** Obligatorio cuando el rol corresponde a personal interno. */
  idCargo?: number;
  fechaIngreso?: string;
  /** Solo aplican cuando el rol es Cliente. */
  preferenciaAlimentaria?: string | null;
  restriccionDietetica?: string | null;
}

export async function listar(filtro: DatosPaginacion): Promise<Pagina<UsuarioListaDTO>> {
  const [filas, total] = await usuarioModel.listar(filtro);

  return pagina(
    filas.map((u) => ({
      id: u.id_usuario,
      nombreCompleto: `${u.nombre} ${u.apellido}`,
      nombreUsuario: u.nombre_usuario,
      email: u.email,
      rol: u.rol.nombre,
      activo: u.activo,
      bloqueado: u.bloqueado,
    })),
    total,
    filtro,
  );
}

export async function obtener(id: number): Promise<UsuarioDetalleDTO> {
  const u = await usuarioModel.buscarPorId(id);
  if (!u) throw new ErrorApp(404, 'Usuario no encontrado');

  return {
    id: u.id_usuario,
    nombre: u.nombre,
    apellido: u.apellido,
    nombreCompleto: `${u.nombre} ${u.apellido}`,
    nombreUsuario: u.nombre_usuario,
    email: u.email,
    telefono: u.telefono,
    rol: u.rol.nombre,
    activo: u.activo,
    bloqueado: u.bloqueado,
    intentosFallidos: u.intentos_fallidos,
    fechaRegistro: u.fecha_registro.toISOString(),
    cargo: u.empleado?.cargo.nombre ?? null,
    fechaIngreso: u.empleado?.fecha_ingreso.toISOString() ?? null,
    preferenciaAlimentaria: u.cliente?.preferencia_alimentaria ?? null,
    restriccionDietetica: u.cliente?.restriccion_dietetica ?? null,
  };
}

/**
 * Resuelve qué especialización corresponde al usuario según su rol y valida
 * los datos que esa especialización exige.
 *
 * CU-SEG-02: "Si el usuario a registrar tiene rol Empleado, el sistema solicita
 * adicionalmente su cargo y fecha de ingreso."
 */
async function resolverSubtipo(nombreRol: string, datos: DatosCrear): Promise<Subtipo> {
  if (!esPersonalInterno(nombreRol)) {
    return {
      tipo: 'cliente',
      preferenciaAlimentaria: datos.preferenciaAlimentaria ?? null,
      restriccionDietetica: datos.restriccionDietetica ?? null,
    };
  }

  if (!datos.idCargo) {
    throw new ErrorApp(400, `El rol ${nombreRol} corresponde a personal interno: debe indicar el cargo`);
  }
  const cargo = await cargoModel.buscarPorId(datos.idCargo);
  if (!cargo) throw new ErrorApp(400, 'El cargo indicado no existe');

  return {
    tipo: 'empleado',
    idCargo: datos.idCargo,
    ...(datos.fechaIngreso ? { fechaIngreso: new Date(datos.fechaIngreso) } : {}),
  };
}

export async function crear(datos: DatosCrear): Promise<UsuarioDetalleDTO> {
  const duplicado = await usuarioModel.existeNombreUsuarioOEmail(datos.nombreUsuario, datos.email);
  if (duplicado) throw new ErrorApp(409, 'Ya existe un usuario con ese nombre de usuario o correo');

  const rol = await rolModel.buscarPorId(datos.idRol);
  if (!rol) throw new ErrorApp(400, 'El rol indicado no existe');

  const subtipo = await resolverSubtipo(rol.nombre, datos);
  const contrasenaHash = await hashearContrasena(datos.contrasena);

  const creado = await usuarioModel.crear({
    nombre: datos.nombre,
    apellido: datos.apellido,
    email: datos.email,
    telefono: datos.telefono,
    nombreUsuario: datos.nombreUsuario,
    contrasenaHash,
    idRol: datos.idRol,
    subtipo,
  });

  return obtener(creado.id_usuario);
}

export async function actualizar(
  id: number,
  datos: Partial<{
    nombre: string;
    apellido: string;
    email: string;
    telefono: string | null;
    activo: boolean;
    idRol: number;
  }>,
): Promise<UsuarioDetalleDTO> {
  const actual = await usuarioModel.buscarPorId(id);
  if (!actual) throw new ErrorApp(404, 'Usuario no encontrado');

  if (datos.email) {
    const duplicado = await usuarioModel.existeNombreUsuarioOEmail(actual.nombre_usuario, datos.email, id);
    if (duplicado) throw new ErrorApp(409, 'Ese correo ya está en uso por otro usuario');
  }

  const { idRol, ...camposSimples } = datos;

  if (idRol && idRol !== actual.id_rol) {
    await validarCambioDeRol(actual.rol.nombre, idRol);
  }

  await usuarioModel.actualizar(id, {
    ...camposSimples,
    ...(idRol ? { id_rol: idRol } : {}),
  });
  return obtener(id);
}

/**
 * Un usuario ya materializado como Empleado no puede pasar a Cliente ni al revés:
 * su fila de subtipo puede estar referenciada por ventas, pedidos, notas de
 * inventario u órdenes de producción, y eliminarla rompería esas referencias.
 * Solo se admite cambiar de rol dentro de la misma familia.
 */
async function validarCambioDeRol(nombreRolActual: string, idRolNuevo: number): Promise<void> {
  const rolNuevo = await rolModel.buscarPorId(idRolNuevo);
  if (!rolNuevo) throw new ErrorApp(400, 'El rol indicado no existe');

  if (esPersonalInterno(nombreRolActual) !== esPersonalInterno(rolNuevo.nombre)) {
    throw new ErrorApp(
      409,
      'No se puede cambiar entre un rol de personal interno y uno de cliente: ' +
        'la especialización del usuario ya está registrada y puede tener operaciones asociadas.',
    );
  }
}

export async function darDeBaja(id: number): Promise<void> {
  const usuario = await usuarioModel.buscarPorId(id);
  if (!usuario) throw new ErrorApp(404, 'Usuario no encontrado');
  await usuarioModel.darDeBaja(id);
}

/** CU-SEG-02, variación: "El administrador puede desbloquear una cuenta bloqueada". */
export async function desbloquear(id: number): Promise<UsuarioDetalleDTO> {
  const usuario = await usuarioModel.buscarPorId(id);
  if (!usuario) throw new ErrorApp(404, 'Usuario no encontrado');
  await usuarioModel.desbloquear(id);
  return obtener(id);
}
