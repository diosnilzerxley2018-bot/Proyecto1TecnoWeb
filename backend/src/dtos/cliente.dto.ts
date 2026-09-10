import { z } from 'zod';
import { camposDePagina } from './paginacion.dto.js';
import { camposPersonales } from './perfil.dto.js';

/** CU-VEN-02 — Gestionar Cliente. */

/** Lo propio del cliente. El titular sí las administra. */
export const esquemaPreferencias = z.object({
  preferenciaAlimentaria: z.string().trim().max(100).nullable().optional(),
  restriccionDietetica: z.string().trim().max(100).nullable().optional(),
});

/**
 * Los cuatro campos personales salen de `perfil.dto`, no se repiten aquí.
 * Antes existían dos definiciones que no coincidían: una recortaba espacios y
 * la otra no.
 */
const datosPersonales = {
  ...camposPersonales,
  ...esquemaPreferencias.shape,
};

/** Actualización por parte del personal (CLIENTE_GESTIONAR). */
export const esquemaActualizarCliente = z
  .object({ ...datosPersonales, activo: z.boolean().optional() })
  .partial();

/**
 * Autoservicio: el cliente modifica sus propios datos.
 *
 * CU-VEN-02, variación: "El cliente puede modificar sus propios datos, pero no
 * los de otros clientes." Por eso este esquema no admite `activo`: dar de baja
 * una cuenta es una decisión del personal, no del titular.
 */
export const esquemaActualizarPerfil = z.object(datosPersonales).partial();

export const esquemaFiltroClientes = z.object({
  termino: z.string().trim().min(1).max(100).optional(),
  incluirInactivos: z
    .enum(['true', 'false'])
    .optional()
    .transform((valor) => valor === 'true'),
  ...camposDePagina,
});

export type DatosActualizarCliente = z.infer<typeof esquemaActualizarCliente>;
export type DatosActualizarPerfil = z.infer<typeof esquemaActualizarPerfil>;
export type FiltroClientesDTO = z.infer<typeof esquemaFiltroClientes>;

export interface ClienteDTO {
  id: number;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  email: string;
  telefono: string | null;
  nombreUsuario: string;
  activo: boolean;
  fechaRegistro: string;
  preferenciaAlimentaria: string | null;
  restriccionDietetica: string | null;
  /** Operaciones asociadas: por qué una ficha con historial no se elimina. */
  cantidadPedidos: number;
  cantidadVentas: number;
}
