/**
 * El día del negocio, no el del meridiano de Greenwich.
 *
 * `new Date('2026-09-07')` es medianoche **UTC**. En Bolivia (UTC−4) eso deja
 * fuera lo ocurrido entre las 20:00 y la medianoche —el turno de la noche—, de
 * modo que un reporte "del 7" perdería las últimas cuatro horas del 7 y sumaría
 * las últimas cuatro del 6.
 *
 * Los límites se arman con los componentes de la fecha para que el día sea el
 * que el negocio vivió. La regla vive **en un solo lugar** porque la comparten
 * los cuatro reportes y los siete listados paginados: escrita en cada uno,
 * corregir el criterio en una copia dejaría las demás desfasadas sin que nada
 * lo delate.
 */

/** El instante inicial o final de una fecha `AAAA-MM-DD`, en hora local. */
export function limitesDelDia(fecha: string, fin: boolean): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return fin
    ? new Date(anio, mes - 1, dia, 23, 59, 59, 999)
    : new Date(anio, mes - 1, dia, 0, 0, 0, 0);
}

/** El rango completo, cuando ambos extremos son obligatorios. */
export const rangoDelPeriodo = (filtro: { desde: string; hasta: string }) => ({
  desde: limitesDelDia(filtro.desde, false),
  hasta: limitesDelDia(filtro.hasta, true),
});

/**
 * El rango como filtro de Prisma, o nada si no se pidió ninguno.
 *
 * Los dos extremos son opcionales: "desde marzo" y "hasta marzo" son consultas
 * legítimas, y exigir ambos obligaría a inventar un extremo.
 */
export function rangoDeFechas(filtro: { desde?: string; hasta?: string }) {
  if (!filtro.desde && !filtro.hasta) return {};

  return {
    ...(filtro.desde ? { gte: limitesDelDia(filtro.desde, false) } : {}),
    ...(filtro.hasta ? { lte: limitesDelDia(filtro.hasta, true) } : {}),
  };
}
