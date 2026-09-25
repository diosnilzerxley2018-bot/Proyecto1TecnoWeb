import { describe, it, expect } from 'vitest';
import { agruparEntrantes, promedioPonderado } from '../src/services/costeo.service.js';

/**
 * CU-INV-03, método de costeo.
 *
 * La regla se prueba aquí sin base de datos porque es aritmética pura; que
 * además se guarde donde corresponde lo verifica `movimientos.test.ts`.
 */

describe('Promedio ponderado móvil', () => {
  it('sin existencias previas toma el costo de la compra', () => {
    // Es el caso del alta del insumo y el del primer reabastecimiento tras
    // agotarlo: conservar el costo viejo sería quedarse con el precio de una
    // mercadería que ya no está.
    expect(promedioPonderado(0, 5, 4, 12)).toBe(12);
  });

  it('pesa cada costo por su cantidad, no por su antigüedad', () => {
    // 4 L a Bs 5 y después 5 L a Bs 10 → (20 + 50) / 9
    expect(promedioPonderado(4, 5, 5, 10)).toBe(7.78);
  });

  it('una compra grande arrastra el promedio hacia el precio nuevo', () => {
    // 1 unidad vieja a 10 contra 99 nuevas a 20: el promedio queda casi en 20.
    expect(promedioPonderado(1, 10, 99, 20)).toBe(19.9);
  });

  it('comprar al mismo precio no mueve el costo', () => {
    expect(promedioPonderado(30, 14, 20, 14)).toBe(14);
  });

  it('una entrada sin cantidad deja el costo como estaba', () => {
    expect(promedioPonderado(10, 7.5, 0, 999)).toBe(7.5);
  });

  it('redondea a los dos decimales que admite la columna', () => {
    // 70/9 = 7.7777... y `costo_unitario` es NUMERIC(10,2).
    const resultado = promedioPonderado(4, 5, 5, 10);
    expect(Number(resultado.toFixed(2))).toBe(resultado);
  });
});

describe('Agrupación de las líneas de una nota', () => {
  it('junta el mismo insumo comprado para dos almacenes', () => {
    // (6x10 + 4x5) / 10 = 8. Si cada línea promediara por separado, la segunda
    // lo haría contra el resultado de la primera y daría otro número.
    const agrupado = agruparEntrantes([
      { idItem: 1, cantidad: 6, costoUnitario: 10 },
      { idItem: 1, cantidad: 4, costoUnitario: 5 },
    ]);

    expect(agrupado.size).toBe(1);
    expect(agrupado.get(1)).toEqual({ cantidad: 10, costoUnitario: 8 });
  });

  it('el orden de las líneas no cambia el resultado', () => {
    const lineas = [
      { idItem: 7, cantidad: 3, costoUnitario: 20 },
      { idItem: 7, cantidad: 9, costoUnitario: 4 },
    ];
    const directo = agruparEntrantes(lineas);
    const invertido = agruparEntrantes([...lineas].reverse());

    expect(directo.get(7)).toEqual(invertido.get(7));
  });

  it('mantiene separados los insumos distintos', () => {
    const agrupado = agruparEntrantes([
      { idItem: 1, cantidad: 2, costoUnitario: 10 },
      { idItem: 2, cantidad: 5, costoUnitario: 3 },
    ]);

    expect(agrupado.get(1)?.costoUnitario).toBe(10);
    expect(agrupado.get(2)?.costoUnitario).toBe(3);
  });
});
