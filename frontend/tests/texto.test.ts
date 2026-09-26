import { describe, it, expect } from 'vitest';
import { coincide, tramosResaltados } from '@/lib/texto';

/**
 * Comparación de texto de los buscadores de la interfaz.
 *
 * Es la misma regla que aplica el servidor (`backend/src/models/busqueda-texto.ts`):
 * si una búsqueda encontrara cosas distintas según dónde se resuelva, el
 * mismo nombre aparecería en un buscador y en el otro no.
 */

describe('coincide', () => {
  it('no distingue tildes ni mayúsculas, en ninguno de los dos lados', () => {
    expect(coincide('Jugo de limón', 'LIMON')).toBe(true);
    expect(coincide('Ensalada Cesar', 'césar')).toBe(true);
    expect(coincide('Peña', 'pena')).toBe(true);
  });

  it('exige todas las palabras, en cualquier orden y aunque no estén juntas', () => {
    expect(coincide('Pechuga de pollo a la plancha', 'plancha pollo')).toBe(true);
    expect(coincide('Pechuga de pollo a la plancha', 'pollo horno')).toBe(false);
  });

  it('una búsqueda vacía no descarta nada', () => {
    expect(coincide('Lo que sea', '   ')).toBe(true);
  });
});

describe('tramosResaltados', () => {
  const resaltado = (texto: string, busqueda: string) =>
    tramosResaltados(texto, busqueda)
      .filter((t) => t.resaltado)
      .map((t) => t.texto);

  it('marca lo buscado con su tilde original, aunque se haya escrito sin ella', () => {
    expect(resaltado('Jugo de limón', 'limon')).toEqual(['limón']);
  });

  it('marca cada palabra donde aparezca', () => {
    expect(resaltado('José Rodríguez', 'rodriguez jose')).toEqual(['José', 'Rodríguez']);
  });

  it('sin búsqueda devuelve el texto entero, sin marcas', () => {
    expect(tramosResaltados('Almacén Seco', '')).toEqual([
      { texto: 'Almacén Seco', resaltado: false },
    ]);
  });
});
