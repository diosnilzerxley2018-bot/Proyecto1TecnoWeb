export interface PermisoDTO {
  id: number;
  nombre: string;
}

export interface RolDTO {
  id: number;
  nombre: string;
  permisos: PermisoDTO[];
  cantidadUsuarios: number;
}

/** Permiso disponible para un usuario, con el indicador de si está habilitado. */
export interface PermisoUsuarioDTO {
  idRolPermiso: number;
  permiso: string;
  habilitado: boolean;
}
