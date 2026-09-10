import { z } from 'zod';

/**
 * Política de contraseñas del sistema (RF-SEG-03).
 *
 * "El sistema debe validar que la contraseña tenga una longitud mínima de 8
 * caracteres y una complejidad que incluya mayúsculas, minúsculas, números y
 * un carácter especial."
 *
 * Se define una sola vez porque la exigen dos flujos distintos —el alta de
 * usuarios por el administrador (CU-SEG-02) y el autorregistro del cliente
 * (CU-VEN-02)—, y una política de seguridad que vive duplicada acaba
 * divergiendo.
 */
export const esquemaContrasena = z
  .string()
  .min(8, 'mínimo 8 caracteres')
  .regex(/[A-Z]/, 'debe incluir una mayúscula')
  .regex(/[a-z]/, 'debe incluir una minúscula')
  .regex(/[0-9]/, 'debe incluir un número')
  .regex(/[^A-Za-z0-9]/, 'debe incluir un carácter especial');

/** Texto de ayuda para la interfaz, derivado de la misma política. */
export const AYUDA_CONTRASENA =
  'Mínimo 8 caracteres, con mayúscula, minúscula, número y un carácter especial';
