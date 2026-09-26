import { z } from 'zod';
import { camposDePagina } from './paginacion.dto.js';

/**
 * Filtro del listado de usuarios.
 *
 * La búsqueda la resuelve el servidor y no la pantalla: el listado viene por
 * páginas, y filtrar solo la página visible dejaría fuera a quien está en la
 * siguiente, justo cuando hay tantos usuarios que hace falta buscar.
 */
export const esquemaFiltroUsuarios = z.object({
  ...camposDePagina,
  /** Nombre, apellido, usuario o correo; varias palabras, en cualquier orden. */
  termino: z.string().trim().min(1).max(100).optional(),
  idRol: z.coerce.number().int().positive().optional(),
  estado: z.enum(['activos', 'bloqueados', 'bajas']).optional(),
});

export type FiltroUsuarios = z.infer<typeof esquemaFiltroUsuarios>;

/** Cuántas cuentas hay en cada situación, para las cifras de la pantalla. */
export interface ResumenUsuariosDTO {
  total: number;
  activos: number;
  bloqueados: number;
  bajas: number;
}

/** Fila del listado de usuarios (RNF-REN-03: solo lo que la vista necesita). */
export interface UsuarioListaDTO {
  id: number;
  nombreCompleto: string;
  nombreUsuario: string;
  email: string;
  rol: string;
  activo: boolean;
  bloqueado: boolean;
}

/** Ficha completa de un usuario. */
export interface UsuarioDetalleDTO extends UsuarioListaDTO {
  nombre: string;
  apellido: string;
  telefono: string | null;
  fechaRegistro: string;
  intentosFallidos: number;
  cargo: string | null;
  fechaIngreso: string | null;
  preferenciaAlimentaria: string | null;
  restriccionDietetica: string | null;
}
