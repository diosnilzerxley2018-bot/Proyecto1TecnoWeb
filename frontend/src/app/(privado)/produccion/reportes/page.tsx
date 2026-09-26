'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RequierePermiso } from '@/components/RequierePermiso';
import { Selector } from '@/components/ui/Selector';
import { Insignia } from '@/components/ui/Insignia';
import { MarcoReporte } from '@/components/reportes/MarcoReporte';
import { Cifra, Cifras, TablaReporte } from '@/components/reportes/PiezasReporte';
import type { ProductoCatalogo, ReporteProduccion } from '@/types';
import { formatearBs } from '@/lib/formato';
import { formatearCantidad } from '@/lib/formato';

/**
 * RF-PRO-08 — reporte de producción por fecha y producto, con el costo de cada
 * corrida y los insumos consumidos.
 *
 * El costo lo trae **registrado la propia orden** (hallazgo H5): se congela al
 * finalizar, con los precios de ese día. Recalcularlo desde la receta haría que
 * corregir el precio de un insumo reescribiera el costo de todo lo ya
 * producido.
 *
 * Las unidades son las **obtenidas**, no las planificadas, y la merma tiene su
 * propia cifra: si se perdieron tres barras, el reporte no puede declarar que
 * salieron (hallazgo H10).
 */
export default function PaginaReporteProduccion() {
  return (
    <RequierePermiso permiso="ORDEN_PRODUCCION_GESTIONAR">
      <ReporteProduccionPantalla />
    </RequierePermiso>
  );
}

function ReporteProduccionPantalla() {
  const [idProducto, setIdProducto] = useState<number | null>(null);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);

  useEffect(() => {
    api
      .get<ProductoCatalogo[]>('/catalogo')
      .then(setProductos)
      .catch(() => {
        // Sin la lista el filtro queda vacío; el reporte general sigue vivo.
      });
  }, []);

  return (
    <MarcoReporte<ReporteProduccion>
      titulo="Reporte de producción"
      descripcion="Cuánto se produjo, qué costó y qué insumos se consumieron"
      recurso="produccion"
      filtros={{ idProducto: idProducto ?? undefined }}
      controles={
        <Selector<number>
          etiqueta="Producto"
          valor={idProducto}
          marcador="Todos los productos"
          onCambiar={(v) => setIdProducto(v === -1 ? null : v)}
          opciones={[
            { valor: -1, etiqueta: 'Todos los productos' },
            ...productos.map((p) => ({ valor: p.id, etiqueta: p.nombre })),
          ]}
        />
      }
      vacio={(r) => r.resumen.corridas === 0}
      tituloVacio="Sin producción en el período"
    >
      {(reporte) => (
        <>
          <Cifras>
            <Cifra etiqueta="Corridas" valor={String(reporte.resumen.corridas)} />
            <Cifra etiqueta="Unidades" valor={String(reporte.resumen.unidades)} />
            <Cifra
              etiqueta="Costo total"
              valor={formatearBs(reporte.resumen.costoTotal)}
              destacada
            />
            {/* La merma es la pregunta que responde H10: cuánto se perdió. */}
            <Cifra etiqueta="Merma" valor={String(reporte.resumen.merma)} />
            <Cifra
              etiqueta="Costo unitario"
              valor={formatearBs(reporte.resumen.costoUnitarioPromedio)}
            />
          </Cifras>

          <TablaReporte
            titulo="Por producto"
            filas={reporte.porProducto}
            clave={(p) => p.producto}
            columnas={[
              { titulo: 'Producto', celda: (p) => p.producto },
              { titulo: 'Corridas', numerica: true, celda: (p) => p.corridas },
              { titulo: 'Unidades', numerica: true, celda: (p) => p.unidades },
              { titulo: 'Costo', numerica: true, celda: (p) => formatearBs(p.costo) },
            ]}
          />

          <TablaReporte
            titulo="Insumos consumidos"
            filas={reporte.insumosConsumidos}
            clave={(i) => i.insumo}
            columnas={[
              { titulo: 'Insumo', celda: (i) => i.insumo },
              {
                titulo: 'Cantidad',
                numerica: true,
                celda: (i) => `${formatearCantidad(i.cantidad)} ${i.unidad}`,
              },
              { titulo: 'Costo', numerica: true, celda: (i) => formatearBs(i.costo) },
            ]}
          />

          <TablaReporte
            titulo="Corridas"
            filas={reporte.corridas}
            clave={(c) => c.idOrden}
            columnas={[
              { titulo: 'Orden', celda: (c) => `#${String(c.idOrden).padStart(5, '0')}` },
              {
                titulo: 'Fecha',
                celda: (c) => new Date(c.fecha).toLocaleDateString('es-BO'),
              },
              {
                titulo: 'Producto',
                celda: (c) => (
                  <span className="flex items-center gap-2">
                    {c.producto}
                    {/* Distinguirlas importa: una corrida instantánea nació de
                        una venta de mostrador, no de una planificación. */}
                    {c.instantanea && <Insignia tono="info">Al instante</Insignia>}
                  </span>
                ),
              },
              { titulo: 'Obtenidas', numerica: true, celda: (c) => c.cantidad },
              {
                titulo: 'Merma',
                numerica: true,
                // Un guion en vez de un cero: lo normal es no tener merma, y
                // una columna de ceros esconde las corridas que sí la tuvieron.
                celda: (c) => (c.merma > 0 ? c.merma : '—'),
              },
              { titulo: 'Costo', numerica: true, celda: (c) => formatearBs(c.costo) },
              {
                titulo: 'Costo unitario',
                numerica: true,
                celda: (c) => formatearBs(c.costoUnitario),
              },
            ]}
          />
        </>
      )}
    </MarcoReporte>
  );
}
