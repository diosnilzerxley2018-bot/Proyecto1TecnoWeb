/**
 * Precisión de las cantidades de insumo: tres decimales.
 *
 * Los insumos se miden en kilogramos y litros, así que el tercer decimal es el
 * gramo y el mililitro, que es la precisión de una balanza de cocina. Con dos
 * decimales —la de las columnas de dinero, que es donde estaban antes— la
 * resolución era de 10 gramos: 125 g de arroz se guardaban como 130 g, 5 g de
 * sal como 10 g, y 4 g como cero, que además violaba `cantidad > 0`.
 *
 * Vive aparte de `dosDecimales` a propósito: dinero y cantidad se redondean
 * distinto, y usar el redondeo del dinero para pesar insumos es exactamente el
 * error que esto corrige.
 */
export const DECIMALES_CANTIDAD = 3;

const FACTOR = 10 ** DECIMALES_CANTIDAD;

/** Redondea una cantidad de insumo a la precisión que admiten sus columnas. */
export const redondearCantidad = (valor: number) => Math.round(valor * FACTOR) / FACTOR;

/**
 * Si la cantidad ya viene con, a lo sumo, los decimales admitidos.
 *
 * Se usa para **rechazar** en la validación lo que la base redondearía en
 * silencio: es preferible que el usuario sepa que 0,0005 kg no se puede
 * registrar a que el sistema lo convierta en 0,001 o en cero sin avisar.
 */
export const tienePrecisionAdmitida = (valor: number) =>
  Math.abs(redondearCantidad(valor) - valor) < 1e-9;
