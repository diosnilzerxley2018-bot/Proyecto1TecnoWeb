import { dosDecimales } from '../utils/dinero.js';
import type { GananciaDTO } from '../dtos/reporte.dto.js';

/**
 * La ganancia de lo vendido, común a los reportes de ventas y de pedidos
 * (RF-VEN-07 y RF-PED-10).
 *
 * - **Ganancia** es lo cobrado menos lo que costó lo vendido: el precio de
 *   cada línea menos su `costo_unitario`, guardado al vender. Es la ganancia
 *   bruta: no descuenta alquiler, sueldos ni servicios, que el sistema no
 *   registra.
 * - **Margen** es esa ganancia como porcentaje de lo cobrado: dice cuánto de
 *   cada boliviano vendido le queda al negocio.
 *
 * Una línea sin costo —un producto que nunca ingresó con costo— no entra en
 * ninguna de las dos: contarla con costo cero inflaría la ganancia. Se cuenta
 * aparte, en `unidadesSinCosto`, para que el reporte lo diga.
 */

export interface AcumuladoGanancia {
  /** Lo cobrado por las líneas que sí tienen costo. */
  importeConCosto: number;
  costo: number;
  lineasConCosto: number;
  unidadesSinCosto: number;
}

export const gananciaVacia = (): AcumuladoGanancia => ({
  importeConCosto: 0,
  costo: 0,
  lineasConCosto: 0,
  unidadesSinCosto: 0,
});

export function sumarLinea(
  acumulado: AcumuladoGanancia,
  linea: { cantidad: number; importe: number; costoUnitario: number | null },
): void {
  if (linea.costoUnitario === null) {
    acumulado.unidadesSinCosto += linea.cantidad;
    return;
  }
  acumulado.lineasConCosto += 1;
  acumulado.importeConCosto = dosDecimales(acumulado.importeConCosto + linea.importe);
  acumulado.costo = dosDecimales(
    acumulado.costo + dosDecimales(linea.cantidad * linea.costoUnitario),
  );
}

export function cerrarGanancia(acumulado: AcumuladoGanancia): GananciaDTO {
  if (acumulado.lineasConCosto === 0) {
    return { costo: null, ganancia: null, margen: null, unidadesSinCosto: acumulado.unidadesSinCosto };
  }
  const ganancia = dosDecimales(acumulado.importeConCosto - acumulado.costo);
  return {
    costo: acumulado.costo,
    ganancia,
    margen:
      acumulado.importeConCosto === 0
        ? null
        : dosDecimales((ganancia / acumulado.importeConCosto) * 100),
    unidadesSinCosto: acumulado.unidadesSinCosto,
  };
}

/** Lo que el PDF dice debajo de las cifras, cuando hay algo que decir. */
export function notaDeGanancia(g: GananciaDTO): string[] {
  const notas = [
    'Ganancia: lo cobrado menos lo que costó lo vendido (ganancia bruta). ' +
      'Margen: la ganancia como porcentaje de lo cobrado.',
  ];
  if (g.unidadesSinCosto > 0) {
    notas.push(
      `${g.unidadesSinCosto} unidad(es) se vendieron sin costo registrado y no entran en la ganancia.`,
    );
  }
  return notas;
}
