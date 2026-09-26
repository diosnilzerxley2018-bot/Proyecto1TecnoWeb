/**
 * Redondeo a dos decimales.
 *
 * Todas las columnas de dinero del esquema son `NUMERIC(10,2)` (las cantidades
 * de insumo llevan tres decimales: ver `cantidad.ts`). Un valor con más
 * decimales no se puede guardar, y dejarlo correr por los cálculos hace que la
 * suma de las partes no dé el total. Se aplica en cada paso, no solo al final.
 *
 * Vive aquí y no en cada servicio porque el criterio de redondeo es uno solo
 * para el sistema: si mañana se decide truncar en vez de redondear, hay un
 * único sitio donde decirlo.
 */
export const dosDecimales = (valor: number) => Math.round(valor * 100) / 100;

/**
 * Un importe como lo lee una persona en Bolivia: «Bs 1.234,50».
 *
 * Es el mismo formato que usa la interfaz (`formatearBs`). Había dos copias
 * de esta función y varios `toFixed(2)` sueltos, y el buscador del portal
 * decía «Bs 15.00» junto a tarjetas que decían «Bs 15,00».
 */
export const bolivianos = (monto: number) =>
  `Bs ${monto.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
