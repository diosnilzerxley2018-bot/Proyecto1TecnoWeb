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
