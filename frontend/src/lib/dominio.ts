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

/* --- Política de contraseñas (RF-SEG-03) --- */

/**
 * Espejo de `backend/src/dtos/contrasena.dto.ts`.
 *
 * Vive una sola vez porque la piden tres pantallas —el alta por el
 * administrador, el autorregistro del cliente y el cambio desde el perfil— y
 * escrita a mano en cada una ya había divergido: dos de las tres prometían
 * «una letra y un número» mientras el servidor exigía mayúscula, minúscula,
 * número y carácter especial, así que el formulario daba por buena una
 * contraseña que el alta después rechazaba.
 */
export const REQUISITOS_CONTRASENA: { texto: string; cumple: (valor: string) => boolean }[] = [
  { texto: 'Al menos 8 caracteres', cumple: (v) => v.length >= 8 },
  { texto: 'Una mayúscula', cumple: (v) => /[A-Z]/.test(v) },
  { texto: 'Una minúscula', cumple: (v) => /[a-z]/.test(v) },
  { texto: 'Un número', cumple: (v) => /[0-9]/.test(v) },
  { texto: 'Un carácter especial', cumple: (v) => /[^A-Za-z0-9]/.test(v) },
];

/** Resumen de una línea, para el pie de un campo. */
export const AYUDA_CONTRASENA =
  'Mínimo 8 caracteres, con mayúscula, minúscula, número y un carácter especial';

export function cumpleLaPolitica(valor: string): boolean {
  return REQUISITOS_CONTRASENA.every((r) => r.cumple(valor));
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
