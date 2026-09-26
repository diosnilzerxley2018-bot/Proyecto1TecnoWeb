import type { Coordenadas } from './dominio';

const RADIO_TIERRA_M = 6_371_000;

/**
 * Distancia en línea recta entre dos puntos, en metros (fórmula del haversine).
 *
 * Es la distancia «a vuelo de pájaro»: por las calles siempre es más. Sirve
 * para saber si el repartidor está cerca o lejos, no para trazar la ruta.
 */
export function distanciaEnMetros(a: Coordenadas, b: Coordenadas): number {
  const radianes = (grados: number) => (grados * Math.PI) / 180;
  const dLat = radianes(b.lat - a.lat);
  const dLon = radianes(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radianes(a.lat)) * Math.cos(radianes(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(h));
}

/**
 * «350 m» o «1,2 km», como se dice en voz alta.
 *
 * Por debajo del kilómetro se redondea a decenas: el GPS de un teléfono no da
 * para más, y «a 347 m» promete una exactitud que no hay.
 */
export function formatearDistancia(metros: number): string {
  if (metros < 1000) return `${Math.max(10, Math.round(metros / 10) * 10)} m`;
  const km = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 }).format(metros / 1000);
  return `${km} km`;
}
