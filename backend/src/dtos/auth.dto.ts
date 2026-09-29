import { z } from 'zod';
import { esquemaContrasena } from './contrasena.dto.js';

/** Datos que devuelve el login. Nunca incluye el hash de la contraseña. */
export interface SesionDTO {
  token: string;
  usuario: {
    id: number;
    nombre: string;
    apellido: string;
    nombreUsuario: string;
    email: string;
    rol: string;
    /**
     * El cargo del empleado, o nulo para un cliente.
     *
     * No da permisos —eso lo hacen los permisos, verificados en el servidor—:
     * sirve para que cada empleado vea las pantallas de **su** tarea. Con solo
     * los permisos, un cocinero veía "Mis entregas" y un botón para iniciar
     * un turno de reparto.
     */
    cargo: string | null;
  };
  permisos: string[];
}

/* ------------------------------------------------------------------ */
/* «Olvidé mi contraseña»                                              */
/* ------------------------------------------------------------------ */

/** Con el correo o con el nombre de usuario: cada uno recuerda uno de los dos. */
const identificador = z
  .string()
  .trim()
  .min(3, 'Escriba su correo o su nombre de usuario')
  .max(150);

const codigo = z
  .string()
  .trim()
  .transform((c) => c.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'El código tiene 6 dígitos'));

export const esquemaSolicitarCodigo = z.object({ identificador });
export const esquemaVerificarCodigo = z.object({ identificador, codigo });
export const esquemaRestablecerContrasena = z.object({
  identificador,
  codigo,
  // La misma política del alta y del perfil (RF-SEG-03).
  contrasena: esquemaContrasena,
});

export type DatosVerificarCodigo = z.infer<typeof esquemaVerificarCodigo>;
export type DatosRestablecerContrasena = z.infer<typeof esquemaRestablecerContrasena>;
