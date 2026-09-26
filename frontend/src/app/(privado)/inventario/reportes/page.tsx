'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Selector } from '@/components/ui/Selector';
import { Insignia } from '@/components/ui/Insignia';
import { MarcoReporte } from '@/components/reportes/MarcoReporte';
import { Cifra, Cifras, TablaReporte } from '@/components/reportes/PiezasReporte';
import type { ExistenciaStock, ReporteInventario } from '@/types';
import { formatearBs, formatearCantidad } from '@/lib/formato';
import { ETIQUETA_MOTIVO } from '@/lib/inventario';

/** Valor del selector: todos los ítems, o un insumo o producto concreto. */
type Eleccion = 'todos' | `insumo:${number}` | `producto:${number}`;

/**
 * RF-INV-08 — reporte de movimientos de inventario por fecha e ítem.
 *
 * Responde "qué entró, qué salió y cuánto queda" de cada ítem en el período.
 *
 * El filtro ofrece insumos **y** productos terminados: el reporte los mueve a
 * los dos, y antes solo se podía elegir un insumo. La lista sale de
 * `/api/stock` y no de `/api/productos`, porque el reporte vive bajo
 * `STOCK_CONSULTAR` y la gestión de productos exige otro permiso: quien puede
 * ver el reporte tiene que poder usar su filtro.
 *
 * El permiso lo verifica el layout del módulo, igual que las demás pestañas
 * de inventario.
 */
export default function PaginaReporteInventario() {
  const [eleccion, setEleccion] = useState<Eleccion>('todos');
  const [items, setItems] = useState<ExistenciaStock[]>([]);

  useEffect(() => {
    api
      .get<ExistenciaStock[]>('/stock')
      .then(setItems)
      .catch(() => {
        // Sin la lista el filtro queda vacío; el reporte general sigue vivo.
      });
  }, []);

  const filtros = useMemo(() => {
    const [tipo, id] = eleccion.split(':');
    if (tipo === 'insumo') return { idIngrediente: Number(id) };
    if (tipo === 'producto') return { idProducto: Number(id) };
    return {};
  }, [eleccion]);

  const opciones = useMemo(
    () => [
      { valor: 'todos' as Eleccion, etiqueta: 'Todos los ítems' },
      ...items
        .filter((i) => i.tipo === 'insumo')
        .map((i) => ({
          valor: `insumo:${i.id}` as Eleccion,
          etiqueta: i.nombre,
          descripcion: `Insumo · ${i.unidad}`,
        })),
      ...items
        .filter((i) => i.tipo === 'producto')
        .map((i) => ({
          valor: `producto:${i.id}` as Eleccion,
          etiqueta: i.nombre,
          descripcion: 'Producto terminado',
        })),
    ],
    [items],
  );

  return (
    <MarcoReporte<ReporteInventario>
      titulo="Reporte de movimientos"
      descripcion="Qué entró, qué salió y cuánto queda de cada insumo y producto en el período"
      recurso="inventario"
      filtros={filtros}
      controles={
        <Selector<Eleccion>
          etiqueta="Ítem"
          valor={eleccion}
          marcador="Todos los ítems"
          onCambiar={setEleccion}
          opciones={opciones}
        />
      }
      vacio={(r) => r.movimientos.length === 0}
      tituloVacio="Sin movimientos en el período"
    >
      {(reporte) => <CuerpoReporte reporte={reporte} unItem={eleccion !== 'todos'} />}
    </MarcoReporte>
  );
}

function CuerpoReporte({ reporte, unItem }: { reporte: ReporteInventario; unItem: boolean }) {
  /*
   * Con un ítem elegido, las cifras dicen **cuánto** entró y salió, en su
   * unidad. Con todos solo pueden contar movimientos: no se suman kilos con
   * litros ni con unidades. Antes el reporte mostraba "Entradas 3" siempre, y
   * con un insumo elegido se leía como tres kilos cuando eran tres líneas.
   */
  const unico = unItem && reporte.porItem.length === 1 ? reporte.porItem[0] : null;

  return (
    <>
      <Cifras>
        {unico ? (
          <>
            <Cifra etiqueta="Entró" valor={`${formatearCantidad(unico.entradas)} ${unico.unidad}`} />
            <Cifra etiqueta="Salió" valor={`${formatearCantidad(unico.salidas)} ${unico.unidad}`} />
            <Cifra
              etiqueta="Existencia hoy"
              valor={`${formatearCantidad(unico.existencia)} ${unico.unidad}`}
            />
          </>
        ) : (
          <>
            <Cifra etiqueta="Movimientos de entrada" valor={String(reporte.resumen.ingresos)} />
            <Cifra etiqueta="Movimientos de salida" valor={String(reporte.resumen.egresos)} />
          </>
        )}
        <Cifra
          etiqueta="Costo ingresado"
          valor={formatearBs(reporte.resumen.costoIngresado)}
          destacada
        />
      </Cifras>

      <TablaReporte
        titulo="Movimiento por ítem"
        filas={reporte.porItem}
        clave={(i) => `${i.tipo}:${i.item}`}
        columnas={[
          { titulo: 'Ítem', celda: (i) => i.item },
          {
            titulo: 'Tipo',
            celda: (i) => (
              <Insignia tono={i.tipo === 'Insumo' ? 'info' : 'marca'}>{i.tipo}</Insignia>
            ),
          },
          {
            titulo: 'Entradas',
            numerica: true,
            celda: (i) => `${formatearCantidad(i.entradas)} ${i.unidad}`,
          },
          {
            titulo: 'Salidas',
            numerica: true,
            celda: (i) => `${formatearCantidad(i.salidas)} ${i.unidad}`,
          },
          {
            titulo: 'Neto del período',
            numerica: true,
            // En rojo cuando salió más de lo que entró en esas fechas. No es el
            // stock: por eso va al lado la existencia de hoy.
            celda: (i) => (
              <span className={i.neto < 0 ? 'text-peligro' : undefined}>
                {formatearCantidad(i.neto)} {i.unidad}
              </span>
            ),
          },
          {
            titulo: 'Existencia hoy',
            numerica: true,
            celda: (i) => `${formatearCantidad(i.existencia)} ${i.unidad}`,
          },
        ]}
      />

      <TablaReporte
        titulo="Detalle de movimientos"
        filas={reporte.movimientos}
        clave={(m, indice) => `${m.fecha}-${m.tipoItem}-${m.item}-${indice}`}
        columnas={[
          {
            titulo: 'Fecha',
            celda: (m) => new Date(m.fecha).toLocaleDateString('es-BO'),
          },
          {
            titulo: 'Tipo',
            celda: (m) => (
              <Insignia tono={m.tipo === 'Ingreso' ? 'marca' : 'aviso'}>{m.tipo}</Insignia>
            ),
          },
          { titulo: 'Motivo', celda: (m) => ETIQUETA_MOTIVO[m.motivo] ?? m.motivo },
          {
            titulo: 'Ítem',
            celda: (m) => (
              <span>
                {m.item}
                <span className="ml-1.5 text-[11px] text-tinta-tenue">{m.tipoItem}</span>
              </span>
            ),
          },
          {
            titulo: 'Cantidad',
            numerica: true,
            celda: (m) => `${formatearCantidad(m.cantidad)} ${m.unidad}`,
          },
          {
            titulo: 'Costo',
            numerica: true,
            // Un egreso no tiene costo propio: se muestra vacío en vez de un
            // cero que se leería como "salió gratis".
            celda: (m) => (m.costo === null ? '—' : formatearBs(m.costo)),
          },
          {
            titulo: 'Referencia',
            // De dónde vino o para qué salió: el proveedor, o la orden de
            // producción y lo que se elaboró con ese insumo.
            celda: (m) => (
              <span className="text-tinta-suave">{m.referencia ?? '—'}</span>
            ),
          },
        ]}
      />
    </>
  );
}
