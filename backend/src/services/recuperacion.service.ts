import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import * as usuarioModel from '../models/usuario.model.js';
import * as recuperacionModel from '../models/recuperacion.model.js';
import * as avisoService from './aviso.service.js';
import { hashearContrasena } from '../utils/hash.js';
import { ErrorApp } from '../errors/error-app.js';
import { env } from '../config/env.js';
import type { DatosRestablecerContrasena, DatosVerificarCodigo } from '../dtos/auth.dto.js';

/**
 * «Olvidé mi contraseña»: un código de seis dígitos al correo de la cuenta.
 *
 * Es la salida para quien olvidó su contraseña o quedó bloqueado (CU-SEG-05),
 * incluido el administrador: el tercer bloqueo ya no caduca solo y él no tiene
 * a nadie por encima que lo desbloquee. Recibir el código en su correo es la
 * prueba de que es el dueño, así que cambiar la contraseña también desbloquea.
 *
 * Las reglas, las de casi todos los sistemas:
 * - La respuesta a «mándeme un código» es siempre la misma, exista o no la
 *   cuenta: si no, el formulario serviría para averiguar quién está registrado.
 * - El código vence a los 15 minutos, sirve una vez y admite 5 intentos; un
 *   código nuevo anula al anterior, y no se manda otro antes de un minuto.
 * - En la base queda su huella (HMAC con el secreto del servidor), nunca el
 *   código: con seis dígitos, un hash sin secreto se adivina en un instante.
 */

const MINUTOS_DE_VIGENCIA = 15;
const MAXIMO_DE_INTENTOS = 5;
const SEGUNDOS_ENTRE_CODIGOS = 60;

const RESPUESTA_SOLICITUD =
  'Si hay una cuenta con ese dato, le enviamos un código a su correo. Revise también la carpeta de spam.';
const CODIGO_INVALIDO = 'El código no es válido o ya venció. Pida uno nuevo.';

/** La huella del código, atada a la cuenta: el mismo código en otra cuenta da otra. */
function huella(idUsuario: number, codigo: string): string {
  return createHmac('sha256', env.jwtSecret).update(`${idUsuario}:${codigo}`).digest('hex');
}

/** La cuenta por su correo o por su nombre de usuario. */
function cuentaDe(identificador: string) {
  const dato = identificador.trim();
  return dato.includes('@') ? usuarioModel.buscarPorEmail(dato) : usuarioModel.buscarPorNombreUsuario(dato);
}

export async function solicitar(identificador: string): Promise<{ mensaje: string }> {
  const cuenta = await cuentaDe(identificador);

  // Una cuenta dada de baja no se reabre por esta vía: la reactiva un administrador.
  if (cuenta?.activo) {
    const ultimo = await recuperacionModel.ultimoDe(cuenta.id_usuario);
    const reciente =
      ultimo !== null &&
      ultimo.usado_en === null &&
      Date.now() - ultimo.creado_en.getTime() < SEGUNDOS_ENTRE_CODIGOS * 1000;

    // Sin esta espera, el botón de reenviar llenaría la bandeja de cualquiera.
    if (!reciente) {
      const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await recuperacionModel.reemplazar(
        cuenta.id_usuario,
        huella(cuenta.id_usuario, codigo),
        new Date(Date.now() + MINUTOS_DE_VIGENCIA * 60_000),
      );
      // En segundo plano: esperar al correo haría tardar solo a las cuentas
      // que existen, y la demora las delataría.
      avisoService.enSegundoPlano(
        avisoService.codigoDeRecuperacion({
          correo: cuenta.email,
          nombre: cuenta.nombre,
          nombreUsuario: cuenta.nombre_usuario,
          codigo,
          minutos: MINUTOS_DE_VIGENCIA,
        }),
      );
    }
  }

  return { mensaje: RESPUESTA_SOLICITUD };
}

/**
 * La cuenta y su código vigente, si el código escrito es el correcto.
 *
 * Cada error cuenta un intento; al quinto el código queda inútil aunque el
 * siguiente fuera el correcto, que es lo que impide probar los millón de
 * combinaciones. Los mensajes no dicen si la cuenta existe.
 */
async function comprobar({ identificador, codigo }: DatosVerificarCodigo) {
  const cuenta = await cuentaDe(identificador);
  if (!cuenta?.activo) throw new ErrorApp(400, CODIGO_INVALIDO);

  const vigente = await recuperacionModel.vigenteDe(cuenta.id_usuario);
  if (!vigente) throw new ErrorApp(400, CODIGO_INVALIDO);
  if (vigente.intentos >= MAXIMO_DE_INTENTOS) {
    throw new ErrorApp(400, 'Se equivocó demasiadas veces con este código. Pida uno nuevo.');
  }

  const esperado = Buffer.from(vigente.codigo_hash, 'hex');
  const recibido = Buffer.from(huella(cuenta.id_usuario, codigo), 'hex');
  if (!timingSafeEqual(esperado, recibido)) {
    const intentos = await recuperacionModel.sumarIntento(vigente.id_recuperacion);
    const quedan = MAXIMO_DE_INTENTOS - intentos;
    throw new ErrorApp(
      400,
      quedan > 0
        ? `El código no es correcto. Le quedan ${quedan} intento(s).`
        : 'El código no es correcto y ya no le quedan intentos. Pida uno nuevo.',
    );
  }

  return { cuenta, vigente };
}

/** Confirma el código antes de pedir la contraseña nueva. No lo gasta. */
export async function verificar(datos: DatosVerificarCodigo): Promise<{ valido: true }> {
  await comprobar(datos);
  return { valido: true };
}

export async function restablecer(datos: DatosRestablecerContrasena): Promise<{ mensaje: string }> {
  const { cuenta, vigente } = await comprobar(datos);

  await recuperacionModel.restablecer(
    vigente.id_recuperacion,
    cuenta.id_usuario,
    await hashearContrasena(datos.contrasena),
  );

  avisoService.enSegundoPlano(
    avisoService.contrasenaRestablecida({
      correo: cuenta.email,
      nombre: cuenta.nombre,
      nombreUsuario: cuenta.nombre_usuario,
    }),
  );

  return { mensaje: 'Su contraseña fue cambiada. Ya puede iniciar sesión con la nueva.' };
}
