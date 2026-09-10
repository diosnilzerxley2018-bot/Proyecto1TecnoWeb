import * as configModel from '../models/configuracion.model.js';
import { MODOS_COBRO, type ModoCobro } from '../config/dominio.js';
import { pasarelaPara, pasarelasRealesDisponibles } from '../pagos/index.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * Parámetros del sistema que el administrador cambia sin tocar código.
 *
 * Hoy hay uno solo —el modo de cobro— pero vive en una tabla genérica a
 * propósito: el modo tiene que poder cambiarse **en caliente**, y una variable
 * de entorno obligaría a reiniciar el servidor, lo cual no es algo que un
 * administrador pueda hacer desde su perfil.
 */

export const CLAVE_MODO_COBRO = 'MODO_COBRO';

/** El sistema nace sin cobrar dinero real; activarlo es una decisión explícita. */
const MODO_POR_OMISION: ModoCobro = 'Simulado';

/**
 * Caché breve del modo de cobro.
 *
 * Se consulta en cada venta y en cada pedido, de modo que leerlo de la base en
 * cada operación sería una consulta por cobro sin ninguna ganancia. Cinco
 * segundos es suficiente para que el cambio del administrador se note de
 * inmediato en la práctica y para que el sistema no consulte de más.
 */
const VIGENCIA_CACHE_MS = 5_000;
let cache: { valor: ModoCobro; expira: number } | null = null;

export function invalidarCache(): void {
  cache = null;
}

export async function modoCobro(): Promise<ModoCobro> {
  if (cache && Date.now() < cache.expira) return cache.valor;

  const fila = await configModel.buscar(CLAVE_MODO_COBRO);
  const valor = esModoValido(fila?.valor) ? fila.valor : MODO_POR_OMISION;

  cache = { valor, expira: Date.now() + VIGENCIA_CACHE_MS };
  return valor;
}

function esModoValido(valor: string | undefined): valor is ModoCobro {
  return valor !== undefined && (MODOS_COBRO as readonly string[]).includes(valor);
}

export interface EstadoCobroDTO {
  modo: ModoCobro;
  /** Pasarela en uso **ahora**. En modo simulado es «Simulada». */
  pasarela: string;
  /**
   * Pasarela que se usaría al activar el dinero real.
   *
   * Es distinta de `pasarela` mientras el modo sea Simulado, y hace falta
   * porque la pantalla que pide confirmar el paso a real debe nombrar a quién
   * va a cobrar, no a quién está cobrando hoy.
   */
  pasarelaReal: string;
  /** Falso cuando el modo es Real pero la pasarela no puede operar todavía. */
  operativa: boolean;
  advertencia?: string;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
  pasarelasDisponibles: string[];
}

export async function estadoCobro(): Promise<EstadoCobroDTO> {
  const modo = await modoCobro();
  const fila = await configModel.buscarConUsuario(CLAVE_MODO_COBRO);

  let pasarela = 'Simulada';
  let operativa = true;
  let advertencia: string | undefined;

  try {
    pasarela = pasarelaPara(modo).nombre;
  } catch (error) {
    // Modo real sin adaptador: se informa en lugar de romper la pantalla.
    operativa = false;
    advertencia = error instanceof ErrorApp ? error.message : 'La pasarela no está disponible';
  }

  if (modo === 'Real' && operativa && !credencialesCompletas()) {
    operativa = false;
    advertencia =
      'El modo real está activo pero faltan credenciales de la pasarela. ' +
      'Los cobros en línea van a fallar hasta configurarlas.';
  }

  return {
    modo,
    pasarela,
    pasarelaReal: process.env.PAGO_PASARELA_REAL ?? 'Libelula',
    operativa,
    advertencia,
    actualizadoEn: fila?.actualizado_en.toISOString() ?? null,
    actualizadoPor: fila?.usuario ? `${fila.usuario.nombre} ${fila.usuario.apellido}` : null,
    pasarelasDisponibles: pasarelasRealesDisponibles(),
  };
}

function credencialesCompletas(): boolean {
  return Boolean(process.env.LIBELULA_URL_BASE && process.env.LIBELULA_API_KEY);
}

/**
 * Cambia el modo de cobro.
 *
 * Pasar a `Real` no se acepta a ciegas: si la pasarela no tiene adaptador o le
 * faltan credenciales, se rechaza el cambio en lugar de dejar el sistema en un
 * estado donde toda venta en línea falla. Es preferible seguir en simulado y
 * saberlo, a estar en real y descubrirlo con un cliente esperando.
 */
export async function cambiarModoCobro(
  idUsuario: number,
  modo: ModoCobro,
): Promise<EstadoCobroDTO> {
  if (modo === 'Real') {
    // Levanta ErrorApp 503 si no hay adaptador para la pasarela configurada.
    pasarelaPara('Real');

    if (!credencialesCompletas()) {
      throw new ErrorApp(
        409,
        'No se puede activar el cobro real sin las credenciales de la pasarela. ' +
          'Configure LIBELULA_URL_BASE y LIBELULA_API_KEY en el servidor y vuelva a intentarlo.',
      );
    }
  }

  await configModel.guardar(
    CLAVE_MODO_COBRO,
    modo,
    idUsuario,
    'Simulado = no se mueve dinero real. Real = se cobra con la pasarela configurada.',
  );
  invalidarCache();

  return estadoCobro();
}
