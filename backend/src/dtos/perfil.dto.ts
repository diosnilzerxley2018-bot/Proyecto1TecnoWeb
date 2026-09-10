import { z } from 'zod';
import { esquemaContrasena } from './contrasena.dto.js';

/**
 * Datos personales de un usuario, en un solo lugar.
 *
 * Antes existían dos definiciones de los mismos cuatro campos: una en
 * `cliente.dto.ts` y otra dentro de `usuario.controller.ts`. No eran idénticas
 * —la del cliente recortaba espacios y la del usuario no—, de modo que el
 * mismo nombre se guardaba distinto según por qué pantalla se hubiera cargado.
 * Esa es la clase de diferencia que nadie nota hasta que dos listados no
 * coinciden.
 *
 * Ambos módulos derivan de aquí. Es el mismo dato, la misma regla.
 */
export const camposPersonales = {
  nombre: z.string().trim().min(1, 'el nombre es obligatorio').max(100),
  apellido: z.string().trim().min(1, 'el apellido es obligatorio').max(100),
  email: z.email('debe ser un correo válido').max(150),
  telefono: z.string().trim().max(20).nullable().optional(),
} as const;

/**
 * Lo que cualquier usuario puede cambiar de sí mismo.
 *
 * Deliberadamente **no** incluye `nombreUsuario`, `rol`, `activo` ni
 * `bloqueado`:
 *
 * - `nombreUsuario` es la identidad con la que inicia sesión y con la que
 *   quedan firmadas sus ventas y sus órdenes. Cambiarla rompería la lectura
 *   del historial.
 * - `rol` y los permisos los define un administrador (CU-SEG-03 y CU-SEG-04).
 *   Si el titular pudiera tocarlos, el control de acceso no controlaría nada.
 * - `activo` y `bloqueado` son decisiones sobre la cuenta, no del titular: una
 *   cuenta bloqueada que pudiera desbloquearse a sí misma no está bloqueada.
 */
export const esquemaActualizarPerfil = z.object(camposPersonales).partial();

/**
 * Cambio de la propia contraseña.
 *
 * Pide la actual aunque la sesión ya esté iniciada, y no es burocracia: es lo
 * que impide que quien encuentre una sesión abierta —una computadora del
 * mostrador sin bloquear— se apropie de la cuenta cambiando la clave.
 *
 * La nueva se valida con `esquemaContrasena`, el mismo de RF-SEG-03 que usa el
 * registro. Una política que solo rige al crear la cuenta y no al cambiarla no
 * es una política.
 */
export const esquemaCambiarContrasena = z
  .object({
    contrasenaActual: z.string().min(1, 'indique su contraseña actual'),
    contrasenaNueva: esquemaContrasena,
  })
  .refine((datos) => datos.contrasenaActual !== datos.contrasenaNueva, {
    message: 'La nueva contraseña debe ser distinta de la actual',
    path: ['contrasenaNueva'],
  });

export type DatosActualizarPerfil = z.infer<typeof esquemaActualizarPerfil>;
export type DatosCambiarContrasena = z.infer<typeof esquemaCambiarContrasena>;

/** Lo propio del empleado. Lo administra la empresa, no el titular. */
export interface DatosLaboralesDTO {
  cargo: string;
  fechaIngreso: string;
}

/** Lo propio del cliente. Esto sí lo administra el titular. */
export interface PreferenciasDTO {
  preferenciaAlimentaria: string | null;
  restriccionDietetica: string | null;
}

/**
 * Perfil del usuario autenticado, sea del tipo que sea.
 *
 * Los bloques `laboral` y `preferencias` son excluyentes: un usuario es
 * empleado o cliente, nunca ambos. Se modela con dos campos anulables en lugar
 * de dos DTO distintos para que la interfaz reciba siempre la misma forma y
 * decida qué dibujar según lo que venga.
 */
export interface PerfilDTO {
  id: number;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  email: string;
  telefono: string | null;
  /** Inmutable: identidad de inicio de sesión y firma del historial. */
  nombreUsuario: string;
  /** Inmutable para el titular: lo asigna un administrador. */
  rol: string;
  fechaRegistro: string;
  /** Nulo mientras la cuenta nunca haya iniciado sesión. */
  ultimoAcceso: string | null;
  laboral: DatosLaboralesDTO | null;
  preferencias: PreferenciasDTO | null;
}
