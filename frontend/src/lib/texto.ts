/**
 * Comparación de texto para los buscadores de la interfaz.
 *
 * Vive una sola vez porque la usan el selector con búsqueda y el buscador
 * general: si cada uno comparara a su manera, "cafe" encontraría el café en
 * uno y en el otro no.
 */

/** Minúsculas y sin tildes: "Almacén" y "almacen" son lo mismo para quien busca. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Las palabras de lo que se escribió, ya normalizadas. */
export function palabrasDe(busqueda: string): string[] {
  return normalizar(busqueda).split(/\s+/).filter(Boolean);
}

/**
 * Si el texto contiene **todas** las palabras buscadas, en cualquier orden.
 *
 * "pollo plancha" encuentra "Pechuga de pollo a la plancha": exigir la frase
 * exacta obligaría a recordar cómo está escrito cada nombre.
 */
export function coincide(texto: string, busqueda: string): boolean {
  const palabras = palabrasDe(busqueda);
  if (palabras.length === 0) return true;
  const normalizado = normalizar(texto);
  return palabras.every((p) => normalizado.includes(p));
}

export interface Tramo {
  texto: string;
  resaltado: boolean;
}

/**
 * Parte el texto en tramos, marcando los que coinciden con lo buscado.
 *
 * Se normaliza carácter por carácter para que las posiciones del texto
 * normalizado sigan siendo las del original y el resaltado caiga donde tiene
 * que caer aunque la palabra lleve tilde. Si algún carácter cambiara de largo
 * al normalizarse, se devuelve el texto sin resaltar antes que resaltar mal.
 */
export function tramosResaltados(texto: string, busqueda: string): Tramo[] {
  const palabras = palabrasDe(busqueda);
  if (palabras.length === 0) return [{ texto, resaltado: false }];

  const caracteres = [...texto];
  const normalizados = caracteres.map((c) => normalizar(c));
  if (normalizados.some((c) => c.length !== 1)) return [{ texto, resaltado: false }];

  const plano = normalizados.join('');
  const marcado = new Array<boolean>(caracteres.length).fill(false);
  for (const palabra of palabras) {
    let desde = plano.indexOf(palabra);
    while (desde !== -1) {
      for (let i = desde; i < desde + palabra.length; i++) marcado[i] = true;
      desde = plano.indexOf(palabra, desde + palabra.length);
    }
  }

  const tramos: Tramo[] = [];
  caracteres.forEach((c, i) => {
    const ultimo = tramos.at(-1);
    if (ultimo && ultimo.resaltado === marcado[i]) ultimo.texto += c;
    else tramos.push({ texto: c, resaltado: marcado[i] });
  });
  return tramos;
}
