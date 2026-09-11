import type { Mensaje, Mensajero, ResultadoEnvio } from './mensajero.js';

/**
 * Mensajero simulado — no envía nada.
 *
 * Es el modo con el que el sistema nace, y el que usan las pruebas. Registra
 * en el log lo que habría enviado, de modo que durante el desarrollo se puede
 * comprobar *que el aviso se disparó* sin montar un servidor de correo.
 *
 * Guarda además los últimos mensajes en memoria. No es un archivo: es lo que
 * permite a una prueba afirmar "se le avisó al cliente" sin interceptar la red.
 */
export class MensajeroSimulado implements Mensajero {
  readonly nombre = 'Simulado';
  readonly enviaDeVerdad = false;

  /** Tope de mensajes recordados. Sin él, un proceso largo crecería sin fin. */
  private static readonly MAXIMO = 50;

  private static readonly buzon: (Mensaje & { fecha: Date })[] = [];

  async enviar(mensaje: Mensaje): Promise<ResultadoEnvio> {
    MensajeroSimulado.buzon.unshift({ ...mensaje, fecha: new Date() });
    MensajeroSimulado.buzon.length = Math.min(
      MensajeroSimulado.buzon.length,
      MensajeroSimulado.MAXIMO,
    );

    console.info(`[correo simulado] para ${mensaje.para.join(', ')} · ${mensaje.asunto}`);

    return { enviado: true, referencia: `SIM-${Date.now()}` };
  }

  /** Los mensajes recordados, del más reciente al más viejo. */
  static get enviados(): readonly (Mensaje & { fecha: Date })[] {
    return MensajeroSimulado.buzon;
  }

  static vaciar(): void {
    MensajeroSimulado.buzon.length = 0;
  }
}
