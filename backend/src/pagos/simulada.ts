import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import type { EstadoPago } from '../config/dominio.js';
import type {
  AvisoPasarela,
  CobroCreado,
  PasarelaPago,
  SolicitudCobro,
} from './pasarela.js';

/**
 * Pasarela simulada — no mueve dinero.
 *
 * Es el modo con el que el sistema nace y con el que se hacen las
 * demostraciones. Genera un código QR con la misma estructura que uno real
 * (monto incluido, para que se vea el número al escanear) pero marcado de
 * forma inequívoca como simulado, de modo que nadie pueda confundirlo con un
 * cobro verdadero ni al mirarlo ni al leerlo con una aplicación bancaria.
 *
 * **Decisión importante:** no confirma el cobro en el acto. Espera
 * `retardoSimuladoMs` y recién entonces se da por pagado. Confirmar al
 * instante habría sido más cómodo, pero dejaría el camino asíncrono —el que
 * espera, el que reintenta, el que vence— sin ejecutarse nunca hasta el día en
 * que se active el dinero real. Se prefiere que el modo simulado recorra
 * exactamente el mismo camino que el real.
 */
export class PasarelaSimulada implements PasarelaPago {
  readonly nombre = 'Simulada';
  readonly modo = 'Simulado' as const;

  /** Momento en que se creó cada cobro, para saber cuándo darlo por pagado. */
  private readonly creados = new Map<string, { creadoEn: number; monto: number }>();

  async crearCobro(solicitud: SolicitudCobro): Promise<CobroCreado> {
    const idTransaccionExterna = `SIM-${randomUUID()}`;
    this.creados.set(idTransaccionExterna, { creadoEn: Date.now(), monto: solicitud.monto });

    const expiraEn = new Date(Date.now() + env.pago.minutosExpiracion * 60_000);

    // Contenido legible: si alguien escanea el código, ve de qué se trata y
    // que no es un cobro real. Un QR simulado que pareciera auténtico sería
    // una forma involuntaria de estafa.
    const datosCobro = [
      'NUTRIEXPRESS-SIMULADO',
      `ref=${solicitud.referenciaInterna}`,
      `monto=${solicitud.monto.toFixed(2)}`,
      `moneda=${solicitud.moneda}`,
      `id=${idTransaccionExterna}`,
      'AVISO=Este codigo no cobra dinero real',
    ].join('|');

    return {
      idTransaccionExterna,
      datosCobro,
      tipoDatos: solicitud.metodo === 'QR' ? 'qr' : 'url',
      expiraEn,
    };
  }

  /**
   * En simulado no hay firma que verificar: nadie externo envía avisos.
   *
   * Devuelve `true` porque el único origen posible es el propio sistema, a
   * través del endpoint de confirmación manual, que sí exige sesión y permiso.
   */
  verificarFirma(): boolean {
    return true;
  }

  interpretarAviso(cuerpo: unknown): AvisoPasarela {
    const datos = cuerpo as { idTransaccion?: string; estado?: EstadoPago; monto?: number };
    return {
      idTransaccionExterna: datos.idTransaccion ?? '',
      estado: datos.estado ?? 'Pagado',
      monto: datos.monto ?? 0,
    };
  }

  /**
   * Se da por pagado una vez transcurrido el retardo.
   *
   * Si el proceso se reinició y el cobro ya no está en memoria, se responde
   * `Pagado`: el registro vive en la base de datos, no aquí, y negar un cobro
   * simulado por un reinicio solo dejaría ventas trabadas sin ninguna ganancia.
   */
  async consultarEstado(idTransaccionExterna: string): Promise<EstadoPago> {
    const cobro = this.creados.get(idTransaccionExterna);
    if (!cobro) return 'Pagado';

    const transcurrido = Date.now() - cobro.creadoEn;
    return transcurrido >= env.pago.retardoSimuladoMs ? 'Pagado' : 'Pendiente';
  }
}
