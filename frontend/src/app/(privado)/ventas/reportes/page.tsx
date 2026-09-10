'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RequierePermiso } from '@/components/RequierePermiso';
import { Selector } from '@/components/ui/Selector';
import { MarcoReporte } from '@/components/reportes/MarcoReporte';
import { Cifra, Cifras, TablaReporte } from '@/components/reportes/PiezasReporte';
import type { ProductoCatalogo, ReporteVentas } from '@/types';
import { formatearBs } from '@/lib/formato';

/**
 * RF-VEN-07 — reporte parametrizado de ventas por rango de fechas y producto,
 * exportable a PDF y enviable por correo electrónico.
 *
 * Es lo que convierte al sistema de *"registra datos"* en *"me dice cómo va el
 * negocio"*. Por eso lo primero que se ve son las cuatro cifras del resumen, y
 * el detalle viene después: quien abre esta pantalla quiere una respuesta, no
 * una tabla.
 */
export default function PaginaReportes() {
  return (
    <RequierePermiso permiso="VENTA_LEER">
      <Reportes />
    </RequierePermiso>
  );
}

function Reportes() {
  const [idProducto, setIdProducto] = useState<number | null>(null);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);

  useEffect(() => {
    api
      .get<ProductoCatalogo[]>('/catalogo')
      .then(setProductos)
      .catch(() => {
        // Sin la lista, el filtro por producto queda vacío y el reporte
        // general sigue funcionando. No vale interrumpir por eso.
      });
  }, []);

  return (
    <MarcoReporte<ReporteVentas>
      titulo="Reporte de ventas"
      descripcion="Cuánto se vendió, qué se vendió y por qué medio se cobró"
      recurso="ventas"
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
      vacio={(r) => r.resumen.cantidadVentas === 0}
      tituloVacio="Sin ventas en el período"
    >
      {(reporte) => (
        <>
          <Cifras>
            <Cifra etiqueta="Ventas" valor={String(reporte.resumen.cantidadVentas)} />
            <Cifra etiqueta="Unidades" valor={String(reporte.resumen.unidades)} />
            <Cifra etiqueta="Total" valor={formatearBs(reporte.resumen.total)} destacada />
            <Cifra
              etiqueta="Ticket promedio"
              valor={formatearBs(reporte.resumen.ticketPromedio)}
            />
          </Cifras>

          <TablaReporte
            titulo="Por producto"
            filas={reporte.porProducto}
            clave={(p) => p.idProducto}
            columnas={[
              { titulo: 'Producto', celda: (p) => p.nombre },
              { titulo: 'Unidades', numerica: true, celda: (p) => p.unidades },
              { titulo: 'Importe', numerica: true, celda: (p) => formatearBs(p.importe) },
              {
                titulo: '% del total',
                numerica: true,
                celda: (p) => `${p.participacion.toFixed(1)} %`,
              },
            ]}
          />

          <TablaReporte
            titulo="Por método de pago"
            filas={reporte.porMetodoPago}
            clave={(m) => m.metodo}
            columnas={[
              { titulo: 'Método', celda: (m) => m.metodo },
              { titulo: 'Ventas', numerica: true, celda: (m) => m.cantidadVentas },
              { titulo: 'Total', numerica: true, celda: (m) => formatearBs(m.total) },
            ]}
          />
        </>
      )}
    </MarcoReporte>
  );
}
