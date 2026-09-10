/**
 * Une clases condicionales descartando lo que no sea una cadena con contenido.
 *
 * Acepta `unknown` a propósito: expresiones como `icono && 'pl-10'` producen
 * el valor original cuando la condición es falsa —que puede ser `0`, `''` o un
 * nodo de React—, y filtrar por tipo evita que eso llegue al atributo `class`.
 *
 * No hace falta fusionar conflictos de Tailwind: las variantes de cada
 * componente del sistema son excluyentes entre sí.
 */
export function cn(...clases: unknown[]): string {
  return clases.filter((c): c is string => typeof c === 'string' && c.length > 0).join(' ');
}
