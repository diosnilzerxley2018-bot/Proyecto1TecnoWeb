import { prisma } from '../config/prisma.js';

/**
 * Códigos para recuperar la contraseña (tabla `recuperacion_contrasena`).
 *
 * Aquí solo se guarda la huella del código (HMAC), nunca el código: quien lea
 * la base no puede usarlo para entrar a ninguna cuenta.
 */

/**
 * Registra un código nuevo y borra los anteriores que no se usaron.
 *
 * Vale solo el último que llegó al correo: si alguien pide dos seguidos y usa
 * el primero, el que tiene en la mano no coincide con el que el sistema espera.
 * Los usados se conservan: son el rastro de cada recuperación.
 */
export const reemplazar = (idUsuario: number, codigoHash: string, expiraEn: Date) =>
  prisma.$transaction([
    prisma.recuperacion_contrasena.deleteMany({ where: { id_usuario: idUsuario, usado_en: null } }),
    prisma.recuperacion_contrasena.create({
      data: { id_usuario: idUsuario, codigo_hash: codigoHash, expira_en: expiraEn },
    }),
  ]);

/** El último código pedido por la cuenta, usado o no: para no reenviar en ráfaga. */
export const ultimoDe = (idUsuario: number) =>
  prisma.recuperacion_contrasena.findFirst({
    where: { id_usuario: idUsuario },
    orderBy: { creado_en: 'desc' },
  });

/** El código que todavía sirve: sin usar y sin vencer. */
export const vigenteDe = (idUsuario: number) =>
  prisma.recuperacion_contrasena.findFirst({
    where: { id_usuario: idUsuario, usado_en: null, expira_en: { gt: new Date() } },
    orderBy: { creado_en: 'desc' },
  });

/** Un intento fallido más con ese código. Devuelve cuántos lleva. */
export const sumarIntento = async (idRecuperacion: number) =>
  (
    await prisma.recuperacion_contrasena.update({
      where: { id_recuperacion: idRecuperacion },
      data: { intentos: { increment: 1 } },
      select: { intentos: true },
    })
  ).intentos;

/**
 * Cambia la contraseña con el código y lo da por usado, en una sola
 * transacción: un código gastado sin contraseña nueva, o al revés, dejaría a
 * la cuenta en un estado que nadie pidió.
 *
 * También desbloquea la cuenta y reinicia la escalada de bloqueos (CU-SEG-05):
 * quien recibió el código en su correo demostró ser el dueño.
 */
export const restablecer = (idRecuperacion: number, idUsuario: number, hash: string) =>
  prisma.$transaction([
    prisma.usuario.update({
      where: { id_usuario: idUsuario },
      data: {
        contrasena_hash: hash,
        bloqueado: false,
        fecha_bloqueo: null,
        intentos_fallidos: 0,
        veces_bloqueado: 0,
      },
    }),
    prisma.recuperacion_contrasena.update({
      where: { id_recuperacion: idRecuperacion },
      data: { usado_en: new Date() },
    }),
  ]);
