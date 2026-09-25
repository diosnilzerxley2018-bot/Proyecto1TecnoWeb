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
