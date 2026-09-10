'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RequierePermiso } from '@/components/RequierePermiso';
import { Selector } from '@/components/ui/Selector';
import { MarcoReporte } from '@/components/reportes/MarcoReporte';
import { Cifra, Cifras, TablaReporte } from '@/components/reportes/PiezasReporte';
import type { ReportePedidos, Repartidor } from '@/types';
import { formatearBs } from '@/lib/formato';
import { ETIQUETA_ESTADO } from '@/lib/pedidos';

/**
 * RF-PED-10 — reporte de pedidos por fecha, estado y repartidor, con el tiempo
 * de entrega.
 *
 * Responde las dos preguntas del reparto: cuántos pedidos entraron y cuánto se
 * tarda en llevarlos. El tiempo no está guardado en ninguna columna; sale de
 * restar la confirmación a la entrega, y por eso solo lo tienen los pedidos que
 * de verdad llegaron.
 */
export default function PaginaReportePedidos() {
  return (
    <RequierePermiso permiso="PEDIDO_LEER">
      <ReportePedidosPantalla />
    </RequierePermiso>
  );
}

/** Los minutos, o el aviso de que todavía no hay con qué medirlos. */
const minutos = (valor: number | null) => (valor === null ? 'sin datos' : `${valor} min`);

function ReportePedidosPantalla() {
  const [estado, setEstado] = useState<string | null>(null);
  const [idRepartidor, setIdRepartidor] = useState<number | null>(null);
  const [repartidores, setRepartidores] = useState<Repartidor[]>([]);

  useEffect(() => {
    api
      .get<Repartidor[]>('/gestion/repartidores')
      .then(setRepartidores)
      .catch(() => {
        // Sin la lista el filtro queda vacío; el reporte general sigue vivo.
      });
  }, []);

  return (
    <MarcoReporte<ReportePedidos>
      titulo="Reporte de pedidos"
      descripcion="Cuántos pedidos entraron, en qué estado quedaron y cuánto se tardó en entregarlos"
      recurso="pedidos"
      filtros={{ estado: estado ?? undefined, idRepartidor: idRepartidor ?? undefined }}
      controles={
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-1">
          <Selector<string>
            etiqueta="Estado"
            valor={estado}
            marcador="Todos"
            onCambiar={(v) => setEstado(v === '' ? null : v)}
            opciones={[
              { valor: '', etiqueta: 'Todos los estados' },
              // Los mismos nombres y etiquetas que usa el resto del módulo.
              ...Object.entries(ETIQUETA_ESTADO).map(([valor, etiqueta]) => ({
                valor,
                etiqueta,
              })),
            ]}
          />
          <Selector<number>
            etiqueta="Repartidor"
            valor={idRepartidor}
            marcador="Todos"
            onCambiar={(v) => setIdRepartidor(v === -1 ? null : v)}
            opciones={[
              { valor: -1, etiqueta: 'Todos los repartidores' },
              ...repartidores.map((r) => ({ valor: r.id, etiqueta: r.nombreCompleto })),
            ]}
          />
        </div>
      }
      vacio={(r) => r.resumen.cantidadPedidos === 0}
      tituloVacio="Sin pedidos en el período"
    >
      {(reporte) => (
        <>
          <Cifras>
            <Cifra etiqueta="Pedidos" valor={String(reporte.resumen.cantidadPedidos)} />
            <Cifra etiqueta="Entregados" valor={String(reporte.resumen.entregados)} />
            <Cifra etiqueta="Total" valor={formatearBs(reporte.resumen.total)} destacada />
            <Cifra
              etiqueta="Entrega promedio"
              valor={minutos(reporte.resumen.minutosPromedio)}
            />
          </Cifras>

          <TablaReporte
            titulo="Por estado"
            filas={reporte.porEstado}
            clave={(e) => e.estado}
            columnas={[
              { titulo: 'Estado', celda: (e) => e.estado },
              { titulo: 'Pedidos', numerica: true, celda: (e) => e.cantidad },
              { titulo: 'Total', numerica: true, celda: (e) => formatearBs(e.total) },
            ]}
          />

          <TablaReporte
            titulo="Por repartidor"
            filas={reporte.porRepartidor}
            clave={(r) => r.repartidor}
            columnas={[
              { titulo: 'Repartidor', celda: (r) => r.repartidor },
              { titulo: 'Entregas', numerica: true, celda: (r) => r.entregas },
              {
                titulo: 'Tiempo promedio',
                numerica: true,
                celda: (r) => minutos(r.minutosPromedio),
              },
            ]}
          />

          <TablaReporte
            titulo="Detalle de pedidos"
            filas={reporte.pedidos}
            clave={(p) => p.id}
            columnas={[
              { titulo: 'Pedido', celda: (p) => `#${String(p.id).padStart(5, '0')}` },
              {
                titulo: 'Fecha',
                celda: (p) => new Date(p.fecha).toLocaleDateString('es-BO'),
              },
              { titulo: 'Estado', celda: (p) => p.estado },
              { titulo: 'Repartidor', celda: (p) => p.repartidor ?? '—' },
              { titulo: 'Total', numerica: true, celda: (p) => formatearBs(p.total) },
              {
                titulo: 'Entrega',
                numerica: true,
                celda: (p) => minutos(p.minutosDeEntrega),
              },
            ]}
          />
        </>
      )}
    </MarcoReporte>
  );
}
