import { Prisma } from '@prisma/client';

/**
 * Una cantidad de insumo como decimal exacto, para compararla o restarla en una
 * columna `NUMERIC(12,3)`.
 *
 * Como número de coma flotante, 65,4 vale 65,400000000000005…, y PostgreSQL lo
 * compara con exactitud contra la columna: «hay 65,400 ≥ 65,4» daba falso, y
 * sacar todo lo que quedaba de un lote o de un insumo se rechazaba por falta
 * de stock. Pasaba con unos valores y no con otros —46,64 sí andaba—, según
 * cayera el redondeo binario. Con los tres decimales de la columna, el valor
 * viaja tal como se escribió.
 */
export const cantidadExacta = (cantidad: number) => new Prisma.Decimal(cantidad.toFixed(3));
