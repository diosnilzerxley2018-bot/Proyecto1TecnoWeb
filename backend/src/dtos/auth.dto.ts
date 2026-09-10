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
  };
  permisos: string[];
}
