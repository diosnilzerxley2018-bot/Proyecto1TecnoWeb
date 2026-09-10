import * as usuarioModel from '../models/usuario.model.js';
import * as permisoModel from '../models/permiso.model.js';
import * as rolModel from '../models/rol.model.js';
import { hashearContrasena } from '../utils/hash.js';
import { ROL_CLIENTE } from '../config/dominio.js';
import { verificarContrasena } from '../utils/hash.js';
import { firmarToken } from '../utils/jwt.js';
import { estadoDelBloqueo, mensajeDeBloqueo } from './bloqueo.service.js';
import { ErrorApp } from '../errors/error-app.js';
import { env } from '../config/env.js';
import type { SesionDTO } from '../dtos/auth.dto.js';

/**
 * CU-SEG-01 Iniciar Sesión
 * Extendido por CU-SEG-05 Bloquear Cuenta por Intentos Fallidos
 * con la condición {tres intentos fallidos consecutivos}.
 */
export async function iniciarSesion(nombreUsuario: string, contrasena: string): Promise<SesionDTO> {
  const usuario = await usuarioModel.buscarPorNombreUsuario(nombreUsuario);

  // Mensaje genérico: no revelamos si el usuario existe o no.
  if (!usuario) throw new ErrorApp(401, 'Credenciales incorrectas');

  if (usuario.bloqueado) {
    /*
     * CU-SEG-05, variación: el bloqueo se libera solo pasado el plazo.
     *
     * Un bloqueo sin salida automática convierte un ataque de un minuto en una
     * interrupción de un día, y cuando le toca al administrador —el único que
     * puede desbloquear— deja al sistema sin nadie capaz de reabrirlo. La
     * espera sigue frenando la fuerza bruta: quien prueba contraseñas al azar
     * avanza tres intentos por cada quince minutos.
     */
    const bloqueo = estadoDelBloqueo(usuario);
    if (bloqueo.vigente) throw new ErrorApp(423, mensajeDeBloqueo(bloqueo));

    // Cumplido el plazo, la cuenta vuelve a estar disponible por sí sola.
    await usuarioModel.desbloquear(usuario.id_usuario);
    usuario.bloqueado = false;
    usuario.intentos_fallidos = 0;
  }
  if (!usuario.activo) {
    throw new ErrorApp(403, 'La cuenta se encuentra dada de baja.');
  }

  const valida = await verificarContrasena(contrasena, usuario.contrasena_hash);

  if (!valida) {
    // --- Punto de extensión: credencialesIncorrectas ---
    const intentos = usuario.intentos_fallidos + 1;
    const bloquear = intentos >= env.maxIntentosFallidos;
    await usuarioModel.registrarIntentoFallido(usuario.id_usuario, intentos, bloquear);

    if (bloquear) {
      throw new ErrorApp(423, 'Cuenta bloqueada por superar los intentos permitidos.');
    }
    const restantes = env.maxIntentosFallidos - intentos;
    throw new ErrorApp(401, `Credenciales incorrectas. Le quedan ${restantes} intento(s).`);
  }

  // El acceso correcto reinicia los intentos y sella la fecha para el perfil.
  await usuarioModel.registrarAccesoExitoso(usuario.id_usuario);

  const permisos = await permisoModel.permisosDeUsuario(usuario.id_usuario);
  const token = firmarToken({
    idUsuario: usuario.id_usuario,
    nombreUsuario: usuario.nombre_usuario,
    idRol: usuario.id_rol,
  });

  return {
    token,
    usuario: {
      id: usuario.id_usuario,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      nombreUsuario: usuario.nombre_usuario,
      email: usuario.email,
      rol: usuario.rol.nombre,
    },
    permisos,
  };
}

/** Devuelve la sesión vigente a partir del token ya verificado. */
export async function sesionActual(idUsuario: number): Promise<Omit<SesionDTO, 'token'>> {
  const usuario = await usuarioModel.buscarPorId(idUsuario);
  if (!usuario) throw new ErrorApp(404, 'Usuario no encontrado');
  const permisos = await permisoModel.permisosDeUsuario(idUsuario);
  return {
    usuario: {
      id: usuario.id_usuario,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      nombreUsuario: usuario.nombre_usuario,
      email: usuario.email,
      rol: usuario.rol.nombre,
    },
    permisos,
  };
}


export interface DatosRegistroCliente {
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string | null;
  nombreUsuario: string;
  contrasena: string;
  preferenciaAlimentaria?: string | null;
  restriccionDietetica?: string | null;
}

/**
 * Autorregistro de un cliente desde el portal web.
 *
 * CU-VEN-02, activación: "...o el cliente se registra desde el portal web."
 * CU-VEN-02, precondiciones: "Para el autorregistro, no se requiere
 * autenticación previa."
 * CU-VEN-02, variación: "Si el registro se realiza desde el portal, el sistema
 * crea automáticamente el usuario con rol Cliente."
 *
 * El rol lo impone el servidor: quien se registra nunca elige su propio rol.
 */
export async function registrarCliente(datos: DatosRegistroCliente): Promise<SesionDTO> {
  const duplicado = await usuarioModel.existeNombreUsuarioOEmail(datos.nombreUsuario, datos.email);
  if (duplicado) throw new ErrorApp(409, 'Ya existe una cuenta con ese nombre de usuario o correo');

  const rol = await rolModel.buscarPorNombre(ROL_CLIENTE);
  if (!rol) throw new ErrorApp(500, 'El rol de cliente no está configurado en el sistema');

  const creado = await usuarioModel.crear({
    nombre: datos.nombre,
    apellido: datos.apellido,
    email: datos.email,
    telefono: datos.telefono,
    nombreUsuario: datos.nombreUsuario,
    contrasenaHash: await hashearContrasena(datos.contrasena),
    idRol: rol.id_rol,
    subtipo: {
      tipo: 'cliente',
      preferenciaAlimentaria: datos.preferenciaAlimentaria ?? null,
      restriccionDietetica: datos.restriccionDietetica ?? null,
    },
  });

  // A diferencia del alta hecha por un administrador (CU-SEG-04), aquí no hay
  // quien habilite los permisos uno por uno: se otorgan todos los de su rol.
  const permisosDelRol = await permisoModel.idsRolPermisoDeRol(rol.id_rol);
  if (permisosDelRol.length > 0) {
    await permisoModel.reemplazarPermisosDeUsuario(creado.id_usuario, permisosDelRol);
  }

  return iniciarSesion(datos.nombreUsuario, datos.contrasena);
}
