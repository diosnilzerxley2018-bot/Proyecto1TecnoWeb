import { Prisma } from '@prisma/client';
import { palabrasDe } from '../utils/texto.js';

/**
 * Búsqueda de texto resuelta en la base, sin distinguir tildes ni mayúsculas.
 *
 * `contains` con `mode: 'insensitive'` iguala las mayúsculas pero no las
 * tildes: "rodriguez" no encontraba a "Rodríguez" ni "limon" el "Jugo de
 * limón", y en un sistema escrito en español eso hace parecer roto al
 * buscador. Además comparaba la frase entera contra cada columna, así que
 * "camila cliente" no encontraba a Camila Cliente: el nombre y el apellido
 * viven en columnas distintas y ninguna contiene las dos palabras.
 *
 * PostgreSQL trae `unaccent`, pero es una extensión que hay que instalar con
 * permisos de superusuario en cada base —la local, Railway y el VPS—.
 * `translate` es del núcleo y alcanza para las letras del idioma.
 */

const CON_TILDE = 'ÁÀÂÄÃáàâäãÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÑñÇç';

/**
 * Las mismas letras sin su marca y en minúscula, en el mismo orden.
 *
 * Sale de `CON_TILDE` con el criterio de `normalizar`, así que la base y la
 * aplicación no pueden discrepar sobre qué letra corresponde a cuál. Va en
 * minúscula porque `lower()` de PostgreSQL, con una base creada en locale
 * `C`, solo convierte letras ASCII: la «Á» tiene que llegarle ya resuelta.
 */
const SIN_TILDE = CON_TILDE.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** `%` y `_` son comodines de LIKE: quien los escribe busca el carácter. */
const escaparComodines = (palabra: string) => palabra.replace(/[\\%_]/g, '\\$&');

/**
 * Condición SQL: `texto` contiene todas las palabras de `termino`, en
 * cualquier orden y sin importar tildes ni mayúsculas.
 *
 * `texto` es una expresión SQL escrita en el modelo —una columna, o varias
 * unidas con `concat_ws(' ', …)`—, nunca algo que venga de la petición: lo
 * buscado viaja siempre como parámetro. El espacio de `concat_ws` impide que
 * una palabra coincida a caballo entre dos columnas.
 *
 * Sin palabras, la condición es verdadera: buscar nada no descarta nada.
 */
export function contieneTodas(texto: Prisma.Sql, termino: string): Prisma.Sql {
  const comparable = Prisma.sql`lower(translate(${texto}, ${CON_TILDE}, ${SIN_TILDE}))`;
  const condiciones = palabrasDe(termino).map(
    (palabra) => Prisma.sql`${comparable} LIKE ${`%${escaparComodines(palabra)}%`}`,
  );
  return condiciones.length > 0 ? Prisma.join(condiciones, ' AND ') : Prisma.sql`TRUE`;
}

/** `LIMIT n` si hay tope; nada si no lo hay. */
export const limite = (tope?: number) => (tope ? Prisma.sql`LIMIT ${tope}` : Prisma.empty);
