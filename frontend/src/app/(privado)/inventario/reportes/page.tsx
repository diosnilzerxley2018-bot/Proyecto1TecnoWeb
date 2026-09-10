'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Selector } from '@/components/ui/Selector';
import { Insignia } from '@/components/ui/Insignia';
import { MarcoReporte } from '@/components/reportes/MarcoReporte';
import { Cifra, Cifras, TablaReporte } from '@/components/reportes/PiezasReporte';
import type { Insumo, ReporteInventario } from '@/types';
import { formatearBs } from '@/lib/formato';

/**
 * RF-INV-08 — reporte de movimientos de inventario por fecha, insumo y
 * producto.
 *
 * Lo que responde es "qué entró, qué salió y qué queda". El neto por ítem es
 * la lectura útil: en negativo significa que se consumió más de lo que entró en
 * el período, que es la señal de que hay que reponer.
 *
 * El permiso lo verifica el layout del módulo (`STOCK_CONSULTAR`), igual que
 * las demás pestañas de inventario.
 */
export default function PaginaReporteInventario() {
  const [idIngrediente, setIdIngrediente] = useState<number | null>(null);
  const [insumos, setInsumos] = useState<Insumo[]>([]);

  useEffect(() => {
    api
      .get<Insumo[]>('/insumos')
      .then(setInsumos)
      .catch(() => {
        // Sin la lista el filtro queda vacío; el reporte general sigue vivo.
      });
  }, []);

  return (
    <MarcoReporte<ReporteInventario>
      titulo="Reporte de movimientos"
      descripcion="Qué entró, qué salió y cuál es el saldo de cada ítem en el período"
      recurso="inventario"
      filtros={{ idIngrediente: idIngrediente ?? undefined }}
      controles={
        <Selector<number>
          etiqueta="Insumo"
          valor={idIngrediente}
          marcador="Todos los insumos"
          onCambiar={(v) => setIdIngrediente(v === -1 ? null : v)}
          opciones={[
            { valor: -1, etiqueta: 'Todos los ítems' },
            ...insumos.map((i) => ({ valor: i.id, etiqueta: i.nombre })),
          ]}
        />
      }
      vacio={(r) => r.movimientos.length === 0}
      tituloVacio="Sin movimientos en el período"
    >
      {(reporte) => (
        <>
          <Cifras>
            <Cifra etiqueta="Entradas" valor={String(reporte.resumen.ingresos)} />
            <Cifra etiqueta="Salidas" valor={String(reporte.resumen.egresos)} />
            <Cifra
              etiqueta="Costo ingresado"
              valor={formatearBs(reporte.resumen.costoIngresado)}
              destacada
            />
          </Cifras>

          <TablaReporte
            titulo="Movimiento por ítem"
            filas={reporte.porItem}
            clave={(i) => i.item}
            columnas={[
              { titulo: 'Ítem', celda: (i) => i.item },
              {
                titulo: 'Entradas',
                numerica: true,
                celda: (i) => `${i.entradas} ${i.unidad}`,
              },
              {
                titulo: 'Salidas',
                numerica: true,
                celda: (i) => `${i.salidas} ${i.unidad}`,
              },
              {
                titulo: 'Neto',
                numerica: true,
                // En rojo cuando salió más de lo que entró: es la señal de que
                // ese ítem se está agotando.
                celda: (i) => (
                  <span className={i.neto < 0 ? 'text-peligro' : undefined}>
                    {i.neto} {i.unidad}
                  </span>
                ),
              },
            ]}
          />

          <TablaReporte
            titulo="Detalle de movimientos"
            filas={reporte.movimientos}
            clave={(m, indice) => `${m.fecha}-${m.item}-${indice}`}
            columnas={[
              {
                titulo: 'Fecha',
                celda: (m) => new Date(m.fecha).toLocaleDateString('es-BO'),
              },
              {
                titulo: 'Tipo',
                celda: (m) => (
                  <Insignia tono={m.tipo === 'Ingreso' ? 'marca' : 'aviso'}>
                    {m.tipo}
                  </Insignia>
                ),
              },
              { titulo: 'Motivo', celda: (m) => m.motivo },
              { titulo: 'Ítem', celda: (m) => m.item },
              {
                titulo: 'Cantidad',
                numerica: true,
                celda: (m) => `${m.cantidad} ${m.unidad}`,
              },
              {
                titulo: 'Costo',
                numerica: true,
                // Un egreso no tiene costo propio: se muestra vacío en vez de
                // un cero que se leería como "salió gratis".
                celda: (m) => (m.costo === null ? '—' : formatearBs(m.costo)),
              },
            ]}
          />
        </>
      )}
    </MarcoReporte>
  );
}
