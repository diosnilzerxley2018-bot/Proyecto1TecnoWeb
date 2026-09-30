import { Info } from 'lucide-react';
import { Cifra, Cifras, type ColumnaTabla } from './PiezasReporte';
import type { GananciaReporte } from '@/types';
import { formatearBs, formatearPorcentaje } from '@/lib/formato';

/**
 * La ganancia de lo vendido, igual en el reporte de ventas y en el de pedidos.
 *
 * - **Ganancia**: lo cobrado menos lo que costó lo vendido. El costo es el que
 *   tenía el producto al venderse, guardado en cada línea, así que una compra
 *   posterior más cara no reescribe lo que ya se ganó.
 * - **Margen**: esa ganancia como porcentaje de lo cobrado.
 *
 * Es ganancia bruta: no descuenta alquiler, sueldos ni servicios, que el
 * sistema no registra.
 */

const sinCosto = 'Sin costo';

export function CifrasGanancia({ ganancia }: { ganancia: GananciaReporte }) {
  const { costo, ganancia: bruta, margen, unidadesSinCosto } = ganancia;

  return (
    <div className="space-y-2">
      <Cifras>
        <Cifra
          etiqueta="Costo de lo vendido"
          valor={costo === null ? sinCosto : formatearBs(costo)}
          ayuda="Lo que le costó al negocio lo que se vendió"
        />
        <Cifra
          etiqueta="Ganancia"
          valor={bruta === null ? sinCosto : formatearBs(bruta)}
          destacada
          negativa={bruta !== null && bruta < 0}
          ayuda="Lo cobrado menos ese costo"
        />
        <Cifra
          etiqueta="Margen"
          valor={margen === null ? sinCosto : formatearPorcentaje(margen)}
          negativa={margen !== null && margen < 0}
          ayuda={
            margen === null
              ? 'La ganancia sobre lo cobrado'
              : `De cada Bs 100 cobrados quedan ${formatearBs(margen)}`
          }
        />
      </Cifras>

      {unidadesSinCosto > 0 && (
        <p className="flex items-start gap-2 px-1 text-xs text-tinta-tenue">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {unidadesSinCosto === 1
            ? 'Una unidad se vendió sin costo registrado y no entra en la ganancia.'
            : `${unidadesSinCosto} unidades se vendieron sin costo registrado y no entran en la ganancia.`}{' '}
          Un producto tiene costo desde su primera nota de ingreso o su primera orden de
          producción.
        </p>
      )}
    </div>
  );
}

/** Costo, ganancia y margen como columnas de la tabla «Por producto». */
export function columnasGanancia<F extends GananciaReporte>(): ColumnaTabla<F>[] {
  return [
    {
      titulo: 'Costo',
      numerica: true,
      celda: (f) => (f.costo === null ? '—' : formatearBs(f.costo)),
    },
    {
      titulo: 'Ganancia',
      numerica: true,
      celda: (f) =>
        f.ganancia === null ? (
          '—'
        ) : (
          <span className={f.ganancia < 0 ? 'text-peligro' : 'text-marca-300'}>
            {formatearBs(f.ganancia)}
          </span>
        ),
    },
    {
      titulo: 'Margen',
      numerica: true,
      celda: (f) => (f.margen === null ? '—' : formatearPorcentaje(f.margen)),
    },
  ];
}
