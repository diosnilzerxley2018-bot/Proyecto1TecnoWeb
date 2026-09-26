/**
 * Texto comparable: sin tildes y en minúsculas.
 *
 * Es el mismo criterio que usa la interfaz (`frontend/src/lib/texto.ts`) y el
 * que reproduce la base en `models/busqueda-texto.ts`. Si cada lado comparara
 * a su manera, una misma búsqueda encontraría cosas distintas según dónde se
 * resolviera.
 */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Las palabras de una búsqueda, ya normalizadas y sin vacías. */
export function palabrasDe(busqueda: string): string[] {
  return normalizar(busqueda).split(/\s+/).filter(Boolean);
}

/**
 * Si `texto` contiene todas las palabras de `busqueda`, en cualquier orden.
 *
 * Es la versión en memoria de `contieneTodas` (`models/busqueda-texto.ts`),
 * para lo que ya está cargado y no vale una consulta.
 */
export function coincide(texto: string, busqueda: string): boolean {
  const normalizado = normalizar(texto);
  return palabrasDe(busqueda).every((palabra) => normalizado.includes(palabra));
}
