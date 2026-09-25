/** Formato de moneda, fechas y cantidades. Boliviano y locale es-BO. */

export function formatearBs(monto: number): string {
  return new Intl.NumberFormat('es-BO', {
    style: 'currency',
    currency: 'BOB',
    minimumFractionDigits: 2,
  }).format(monto);
}

export function formatearFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-BO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatearDia(iso: string): string {
  return new Intl.DateTimeFormat('es-BO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * Cantidades con hasta dos decimales, sin ceros de relleno.
 *
 * Los insumos se miden en fracciones —0,24 kg— y los productos en unidades
 * enteras; una sola función evita mostrar "3,00 u" donde basta con "3".
 */
export function formatearCantidad(valor: number): string {
  // Tres decimales: el gramo y el mililitro. Con dos, 0,125 kg se leía 0,13.
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 3 }).format(valor);
}

/** Antigüedad en palabras, para saber de un vistazo cuánto lleva algo esperando. */
export function tiempoTranscurrido(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'recién llegado';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}
