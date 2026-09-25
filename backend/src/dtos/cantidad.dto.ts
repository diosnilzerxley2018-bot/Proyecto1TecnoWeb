import { z } from 'zod';
import { DECIMALES_CANTIDAD, tienePrecisionAdmitida } from '../utils/cantidad.js';

/**
 * Validación de las cantidades de insumo, en un solo lugar.
 *
 * La comparten la receta, las notas de ingreso y egreso y el stock mínimo del
 * insumo, por la misma razón que la política de contraseñas vive una sola vez
 * (`contrasena.dto.ts`): si cada formulario la escribiera a mano, con el tiempo
 * dirían cosas distintas.
 *
 * Existe porque antes **nada** limitaba los decimales. El API aceptaba 0,004
 * kg y era PostgreSQL el que lo redondeaba al guardar —a 0,00, que después
 * violaba `cantidad > 0` y terminaba en un error 500 sin explicación—. Ahora
 * lo que no se puede guardar se rechaza al entrar, diciendo por qué.
 */

/** NUMERIC(12,3): nueve enteros y tres decimales. */
const MAXIMO = 999_999_999.999;

const MENSAJE_PRECISION =
  `admite hasta ${DECIMALES_CANTIDAD} decimales (el gramo o el mililitro)`;

/** Cantidad de insumo estrictamente positiva: una línea de receta o de nota. */
export const cantidadDeInsumo = (etiqueta: string) =>
  z
    .number()
    .gt(0, `${etiqueta} debe ser mayor a cero`)
    .max(MAXIMO, `${etiqueta} excede el máximo admitido`)
    .refine(tienePrecisionAdmitida, `${etiqueta} ${MENSAJE_PRECISION}`);

/** Cantidad de insumo que puede ser cero: el stock mínimo. */
export const cantidadDeInsumoOCero = (etiqueta: string) =>
  z
    .number()
    .min(0, `${etiqueta} no puede ser negativo`)
    .max(MAXIMO, `${etiqueta} excede el máximo admitido`)
    .refine(tienePrecisionAdmitida, `${etiqueta} ${MENSAJE_PRECISION}`);
