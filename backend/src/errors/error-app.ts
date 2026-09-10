/**
 * Error de negocio con su código HTTP asociado.
 *
 * Vive fuera de la capa de middlewares para que los servicios puedan usarlo
 * sin depender del transporte HTTP: la regla de dependencia del proyecto es
 * routes → controllers → services → models, nunca a la inversa ni en diagonal.
 */
export class ErrorApp extends Error {
  constructor(
    public readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorApp';
  }
}
