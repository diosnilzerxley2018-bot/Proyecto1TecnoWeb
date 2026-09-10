import bcrypt from 'bcrypt';
import { prisma } from '../config/prisma.js';
import * as usuarioModel from '../models/usuario.model.js';
import * as clienteModel from '../models/cliente.model.js';
import { env } from '../config/env.js';
import type {
  DatosActualizarPerfil,
  DatosCambiarContrasena,
  PerfilDTO,
} from '../dtos/perfil.dto.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * Autoservicio de la cuenta propia.
 *
 * Un solo servicio para empleados y clientes, porque la operación es la misma:
 * *el titular edita sus datos*. El modelo de clases declara a Usuario como
 * supertipo de Empleado y Cliente, y lo que se edita aquí vive todo en Usuario;
 * lo que difiere entre subtipos se agrega al leer, no al escribir.
 *
 * Duplicar esto en `usuario.service` y `cliente.service` habría significado dos
 * validaciones de la misma contraseña y dos comprobaciones del mismo correo
 * repetido, que es exactamente como se llega a que una de las dos se corrija y
 * la otra no.
 *
 * **La regla que gobierna el archivo:** aquí solo entra lo que el titular puede
 * decidir sobre sí mismo. El rol, los permisos, el estado de la cuenta y el
 * nombre de usuario se administran desde CU-SEG-02, CU-SEG-03 y CU-SEG-04, y
 * no tienen puerta de entrada por este lado.
 */

async function exigirUsuario(idUsuario: number) {
  const usuario = await usuarioModel.buscarPorId(idUsuario);
  if (!usuario) throw new ErrorApp(404, 'La cuenta no existe');
  return usuario;
}

type UsuarioConsultado = Awaited<ReturnType<typeof exigirUsuario>>;

function aDTO(usuario: NonNullable<UsuarioConsultado>): PerfilDTO {
  return {
    id: usuario.id_usuario,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    nombreCompleto: `${usuario.nombre} ${usuario.apellido}`,
    email: usuario.email,
    telefono: usuario.telefono,
    nombreUsuario: usuario.nombre_usuario,
    rol: usuario.rol.nombre,
    fechaRegistro: usuario.fecha_registro.toISOString(),
    ultimoAcceso: usuario.ultimo_acceso?.toISOString() ?? null,
    laboral: usuario.empleado
      ? {
          cargo: usuario.empleado.cargo.nombre,
          fechaIngreso: usuario.empleado.fecha_ingreso.toISOString(),
        }
      : null,
    preferencias: usuario.cliente
      ? {
          preferenciaAlimentaria: usuario.cliente.preferencia_alimentaria,
          restriccionDietetica: usuario.cliente.restriccion_dietetica,
        }
      : null,
  };
}

export async function obtener(idUsuario: number): Promise<PerfilDTO> {
  return aDTO(await exigirUsuario(idUsuario));
}

/**
 * Actualiza los datos personales del titular.
 *
 * El correo se comprueba contra el resto de las cuentas porque el esquema lo
 * declara único: adelantarse permite devolver un mensaje legible en lugar de
 * un error de violación de índice.
 */
export async function actualizar(
  idUsuario: number,
  datos: DatosActualizarPerfil,
): Promise<PerfilDTO> {
  const usuario = await exigirUsuario(idUsuario);

  if (datos.email && datos.email !== usuario.email) {
    const enUso = await usuarioModel.existeNombreUsuarioOEmail(
      usuario.nombre_usuario,
      datos.email,
      idUsuario,
    );
    if (enUso) throw new ErrorApp(409, 'Ese correo ya está registrado en otra cuenta');
  }

  await usuarioModel.actualizar(idUsuario, {
    ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
    ...(datos.apellido !== undefined ? { apellido: datos.apellido } : {}),
    ...(datos.email !== undefined ? { email: datos.email } : {}),
    ...(datos.telefono !== undefined ? { telefono: datos.telefono } : {}),
  });

  return obtener(idUsuario);
}

/**
 * Cambia la contraseña del titular.
 *
 * Exige la actual aunque la sesión ya esté abierta. Es la diferencia entre
 * "quien tiene la sesión" y "quien sabe la contraseña": sin esta comprobación,
 * una computadora del mostrador que quedó sin bloquear alcanza para apropiarse
 * de la cuenta.
 *
 * El mensaje de error es el mismo para "la actual no coincide" que para
 * cualquier otro fallo de credencial, por costumbre y no por descuido: no
 * conviene confirmarle a nadie cuál de las dos mitades acertó.
 */
export async function cambiarContrasena(
  idUsuario: number,
  datos: DatosCambiarContrasena,
): Promise<void> {
  // Se lee el hash aparte: `buscarPorId` no lo trae, y es correcto que no lo
  // haga: ese dato solo hace falta aquí y al iniciar sesión.
  const credencial = await prisma.usuario.findUnique({
    where: { id_usuario: idUsuario },
    select: { contrasena_hash: true, activo: true, bloqueado: true },
  });

  if (!credencial) throw new ErrorApp(404, 'La cuenta no existe');

  if (!credencial.activo || credencial.bloqueado) {
    throw new ErrorApp(403, 'La cuenta no está habilitada para cambiar su contraseña');
  }

  const coincide = await bcrypt.compare(datos.contrasenaActual, credencial.contrasena_hash);
  if (!coincide) throw new ErrorApp(401, 'La contraseña actual no es correcta');

  const hash = await bcrypt.hash(datos.contrasenaNueva, env.bcryptRounds);
  await usuarioModel.cambiarContrasena(idUsuario, hash);
}

/**
 * Preferencias alimentarias del cliente.
 *
 * Vive aquí y no en `cliente.service` porque es autoservicio del titular, que
 * es de lo que trata este archivo. `cliente.service` conserva lo que hace el
 * personal sobre fichas ajenas, que es otra operación y otro permiso.
 */
export async function actualizarPreferencias(
  idUsuario: number,
  datos: { preferenciaAlimentaria?: string | null; restriccionDietetica?: string | null },
): Promise<PerfilDTO> {
  const usuario = await exigirUsuario(idUsuario);

  if (!usuario.cliente) {
    throw new ErrorApp(403, 'Solo los clientes registrados tienen preferencias alimentarias');
  }

  await clienteModel.actualizarPreferencias(idUsuario, datos);
  return obtener(idUsuario);
}
