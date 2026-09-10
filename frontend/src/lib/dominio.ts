/**
 * Espejo de la regla de dominio del backend (backend/src/config/dominio.ts).
 *
 * Se duplica a propósito: el frontend la usa para decidir qué campos mostrar,
 * pero la validación que manda es siempre la del servidor (RNF-SEG-04).
 */

/** Rol que identifica a un actor externo del portal de pedidos. */
export const ROL_CLIENTE = 'Cliente';

/** Un usuario es personal interno cuando su rol no es el de cliente. */
export function esPersonalInterno(nombreRol: string): boolean {
  return nombreRol !== ROL_CLIENTE;
}

/* --- Ubicación de entrega (CU-PED-03) --- */

export interface Coordenadas {
  lat: number;
  lon: number;
}

/**
 * Decimales que admite la columna: `ubicacion.latitud` es `NUMERIC(8,6)` y
 * `longitud` es `NUMERIC(9,6)`. Se redondea aquí y no al enviar para que el
 * número que el cliente ve en pantalla sea exactamente el que se guarda; si no,
 * PostgreSQL recorta por su cuenta y lo mostrado deja de coincidir con lo
 * almacenado. Seis decimales son unos 11 cm: de sobra para una puerta.
 */
export const DECIMALES_COORDENADA = 6;

export function redondearCoordenadas({ lat, lon }: Coordenadas): Coordenadas {
  return {
    lat: Number(lat.toFixed(DECIMALES_COORDENADA)),
    lon: Number(lon.toFixed(DECIMALES_COORDENADA)),
  };
}

/**
 * Centro de reparto, usado cuando todavía no hay punto elegido.
 * El negocio opera en Santa Cruz de la Sierra.
 */
export const CENTRO_REPARTO: Coordenadas = { lat: -17.783327, lon: -63.18214 };
