import type { ModoCobro } from '../config/dominio.js';
import { PasarelaSimulada } from './simulada.js';
import { PasarelaLibelula } from './libelula.js';
import type { PasarelaPago } from './pasarela.js';
import { ErrorApp } from '../errors/error-app.js';

export type { PasarelaPago, SolicitudCobro, CobroCreado, AvisoPasarela } from './pasarela.js';

/**
 * Registro de pasarelas disponibles.
 *
 * Las instancias son únicas y de larga vida: la simulada guarda en memoria
 * cuándo se creó cada cobro para saber cuándo darlo por pagado, y crear una
 * nueva en cada petición perdería ese dato.
 */
const simulada = new PasarelaSimulada();

const REALES: Record<string, () => PasarelaPago> = {
  Libelula: () => new PasarelaLibelula(),
};

let realVigente: PasarelaPago | null = null;

/**
 * Devuelve la pasarela que corresponde al modo indicado.
 *
 * Es el único punto del sistema donde se decide con quién se cobra. Los
 * servicios reciben una `PasarelaPago` y no saben —ni deben saber— si detrás
 * hay un banco o una simulación.
 */
export function pasarelaPara(modo: ModoCobro): PasarelaPago {
  if (modo === 'Simulado') return simulada;

  if (!realVigente) {
    const fabrica = REALES[envPasarelaReal()];
    if (!fabrica) {
      throw new ErrorApp(
        503,
        `No hay adaptador para la pasarela "${envPasarelaReal()}". ` +
          'Revise PAGO_PASARELA_REAL o vuelva al modo simulado.',
      );
    }
    realVigente = fabrica();
  }
  return realVigente;
}

/** Nombres de pasarela real con adaptador disponible. */
export function pasarelasRealesDisponibles(): string[] {
  return Object.keys(REALES);
}

function envPasarelaReal(): string {
  // Importación diferida para que `env` no se evalúe al cargar el módulo, que
  // es lo que permite a las pruebas ajustar las variables antes de usarlo.
  return process.env.PAGO_PASARELA_REAL ?? 'Libelula';
}
