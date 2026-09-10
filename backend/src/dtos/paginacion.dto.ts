import { z } from 'zod';

/* La regla de la hora local vive en un solo lugar; se reexporta para que
   los modelos la reciban junto al resto del contrato de paginación. */
export { rangoDeFechas } from '../utils/fechas.js';

/**
 * Paginación de los listados (hallazgo H7, RNF-REN-01).
 *
 * Antes de esto, cada listado traía la tabla entera: con cinco mil ventas, el
 * historial las cargaba todas para mostrar veinte. El problema no es solo la
 * pantalla —es la consulta, el JSON y la memoria del navegador, los tres
 * creciendo sin techo mientras el negocio funciona.
 *
 * El contrato es **uno solo para todos los listados**. Un formato distinto por
 * módulo obligaría a que cada pantalla del portal aprendiera el suyo.
 */

/** Cuántos elementos trae una página si nadie lo dice. */
export const POR_PAGINA_POR_OMISION = 20;

/**
 * Tope por página.
 *
 * Sin él, `?porPagina=999999` devuelve la tabla entera y la paginación deja de
 * proteger nada: el límite tiene que vivir en el servidor.
 */
export const POR_PAGINA_MAXIMO = 100;

export const camposDePagina = {
  pagina: z.coerce.number().int().positive().default(1),
  porPagina: z.coerce
    .number()
    .int()
    .positive()
    .max(POR_PAGINA_MAXIMO, `No se pueden pedir más de ${POR_PAGINA_MAXIMO} por página`)
    .default(POR_PAGINA_POR_OMISION),
} as const;

/**
 * Rango de fechas opcional, para los listados que crecen con el tiempo.
 *
 * Va junto a la paginación porque responde a la misma pregunta desde el otro
 * lado: la página acota **cuánto** se trae, la fecha acota **qué** se trae. Sin
 * la segunda, buscar una venta de marzo obliga a recorrer páginas hasta marzo.
 */
export const camposDeFecha = {
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
} as const;

export const esquemaPaginacion = z.object(camposDePagina);

export type DatosPaginacion = z.infer<typeof esquemaPaginacion>;

export interface Pagina<T> {
  datos: T[];
  pagina: number;
  porPagina: number;
  /** Cuántos hay en total con los filtros aplicados, no cuántos vinieron. */
  total: number;
  /** Cuántas páginas hay. Es lo que necesita la interfaz para navegar. */
  paginas: number;
}

/**
 * Arma la respuesta.
 *
 * `paginas` se calcula aquí y no en cada pantalla: si cada una lo dedujera del
 * total, una redondearía distinto que otra y la última página aparecería o
 * desaparecería según dónde se mire.
 */
export function pagina<T>(
  datos: T[],
  total: number,
  parametros: DatosPaginacion,
): Pagina<T> {
  return {
    datos,
    pagina: parametros.pagina,
    porPagina: parametros.porPagina,
    total,
    paginas: Math.max(1, Math.ceil(total / parametros.porPagina)),
  };
}

/**
 * Convierte una página en el vocabulario de Prisma.
 *
 * Vive aquí, junto al contrato, porque `skip`/`take` es la traducción directa
 * de `pagina`/`porPagina` y separarlos dejaría la aritmética repetida en cada
 * modelo, que es exactamente donde un error de un elemento pasa inadvertido.
 */
export const recorte = (parametros: DatosPaginacion) => ({
  skip: (parametros.pagina - 1) * parametros.porPagina,
  take: parametros.porPagina,
});
