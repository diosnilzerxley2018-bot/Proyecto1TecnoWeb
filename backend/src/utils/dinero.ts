/**
 * Redondeo a dos decimales.
 *
 * Todas las columnas de dinero del esquema son `NUMERIC(10,2)`, y todas las
 * cantidades de insumo `NUMERIC(10,2)`: un valor con más decimales no se puede
 * guardar, y dejarlo correr por los cálculos hace que la suma de las partes no
 * dé el total. Se aplica en cada paso, no solo al final.
 *
 * Vive aquí y no en cada servicio porque el criterio de redondeo es uno solo
 * para el sistema: si mañana se decide truncar en vez de redondear, hay un
 * único sitio donde decirlo.
 */
export const dosDecimales = (valor: number) => Math.round(valor * 100) / 100;
