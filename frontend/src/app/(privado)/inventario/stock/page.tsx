'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  Gauge,
  Package,
  RefreshCw,
  Search,
  Snowflake,
  Warehouse,
} from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { Estadistica } from '@/components/ui/Estadistica';
import { ChipsFiltro } from '@/components/ui/ChipsFiltro';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Insignia } from '@/components/ui/Insignia';
import { Boton } from '@/components/ui/Boton';
import { Selector } from '@/components/ui/Selector';
import { BarraStock } from '@/components/inventario/BarraStock';
import type { Almacen, AlertaStock, ExistenciaStock, LoteVigente, TipoItem } from '@/types';
import { formatearCantidad } from '@/lib/formato';
import { cn } from '@/lib/cn';

type Vista = 'todos' | TipoItem;

/** CU-INV-05 — Control de Stock. */
export default function PaginaStock() {
  const { notificar } = useNotificaciones();

  const [existencias, setExistencias] = useState<ExistenciaStock[]>([]);
  const [alertas, setAlertas] = useState<AlertaStock[]>([]);
  const [lotes, setLotes] = useState<LoteVigente[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const [vista, setVista] = useState<Vista>('todos');
  const [idAlmacen, setIdAlmacen] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const cargar = useCallback(
    async (silencioso = false) => {
      if (silencioso) setRefrescando(true);
      try {
        const parametros = new URLSearchParams();
        if (idAlmacen !== null) parametros.set('almacen', String(idAlmacen));
        const consulta = parametros.toString();

        const [lista, listaAlertas, listaAlmacenes, listaLotes] = await Promise.all([
          api.get<ExistenciaStock[]>(`/stock${consulta ? `?${consulta}` : ''}`),
          api.get<AlertaStock[]>('/stock/alertas'),
          api.get<Almacen[]>('/almacenes'),
          // Horizonte de un mes: lo que hay que usar o retirar pronto.
          api.get<LoteVigente[]>('/stock/vencimientos?dias=30'),
        ]);
        setExistencias(lista);
        setAlertas(listaAlertas);
        setAlmacenes(listaAlmacenes);
        setLotes(listaLotes);
      } catch (e) {
        notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo consultar el stock');
      } finally {
        setCargando(false);
        setRefrescando(false);
      }
    },
    [idAlmacen, notificar],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const insumos = useMemo(() => existencias.filter((e) => e.tipo === 'insumo'), [existencias]);
  const productos = useMemo(() => existencias.filter((e) => e.tipo === 'producto'), [existencias]);

  /**
   * El filtro por almacén viaja al servidor porque cambia qué filas de
   * existencia se traen; el de tipo y el de texto se resuelven aquí, sobre lo
   * ya cargado, para que los recuentos de las pestañas no parpadeen.
   */
  const visibles = useMemo(() => {
    const base = vista === 'todos' ? existencias : existencias.filter((e) => e.tipo === vista);
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return base;
    return base.filter((e) => e.nombre.toLowerCase().includes(termino));
  }, [existencias, vista, busqueda]);

  return (
    <>
      <EncabezadoPagina
        titulo="Control de stock"
        descripcion="Existencias de insumos y productos terminados, con sus alertas de reposición"
        acciones={
          <Boton
            variante="secundario"
            cargando={refrescando}
            onClick={() => void cargar(true)}
            icono={<RefreshCw className="size-4" aria-hidden />}
          >
            Actualizar
          </Boton>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Estadistica
          indice={0}
          etiqueta="Insumos"
          valor={insumos.length}
          tono="info"
          icono={<Boxes className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={1}
          etiqueta="Productos terminados"
          valor={productos.length}
          tono="marca"
          icono={<Package className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={2}
          etiqueta="Alertas de reposición"
          valor={alertas.length}
          tono={alertas.length > 0 ? 'aviso' : 'neutro'}
          icono={<AlertTriangle className="size-5" aria-hidden />}
        />
      </div>

      <AnimatePresence>
        {alertas.length > 0 && <PanelAlertas alertas={alertas} />}
      </AnimatePresence>

      <AnimatePresence>
        {lotes.length > 0 && <PanelVencimientos lotes={lotes} />}
      </AnimatePresence>

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <ChipsFiltro<Vista>
          idGrupo="filtro-stock"
          valor={vista}
          onCambiar={setVista}
          opciones={[
            { valor: 'todos', etiqueta: 'Todo', cantidad: existencias.length },
            { valor: 'insumo', etiqueta: 'Insumos', cantidad: insumos.length },
            { valor: 'producto', etiqueta: 'Productos', cantidad: productos.length },
          ]}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Selector<number>
            etiqueta="Almacén"
            className="sm:w-52"
            valor={idAlmacen}
            marcador="Todos los almacenes"
            onCambiar={(valor) => setIdAlmacen(valor === -1 ? null : valor)}
            opciones={[
              { valor: -1, etiqueta: 'Todos los almacenes' },
              ...almacenes.map((a) => ({
                valor: a.id,
                etiqueta: a.nombre,
                descripcion: a.tipoConservacion,
              })),
            ]}
          />

          <div className="relative sm:w-64">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
              aria-hidden
            />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar ítem"
              aria-label="Buscar en el stock"
              className="h-12 w-full rounded-xl border border-borde bg-superficie-alta pl-10 pr-3 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-tenue hover:border-borde-fuerte focus:border-marca-500/60"
            />
          </div>
        </div>
      </div>

      {cargando ? (
        <EsqueletoFilas filas={8} alto="h-16" />
      ) : visibles.length === 0 ? (
        <EstadoVacio
          icono={<Gauge className="size-6" aria-hidden />}
          titulo="Sin existencias que mostrar"
          descripcion="Ningún ítem coincide con los filtros aplicados. Pruebe con otro almacén o limpie la búsqueda."
          accion={
            <Boton
              variante="contorno"
              onClick={() => {
                setVista('todos');
                setBusqueda('');
                setIdAlmacen(null);
              }}
            >
              Limpiar filtros
            </Boton>
          }
        />
      ) : (
        <div className="superficie-tarjeta overflow-hidden rounded-2xl">
          <ul className="divide-y divide-borde">
            <AnimatePresence mode="popLayout">
              {visibles.map((item, indice) => (
                <FilaStock key={`${item.tipo}-${item.id}`} item={item} indice={indice} />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </>
  );
}

/** CU-INV-05: los insumos que alcanzaron o descendieron bajo su stock mínimo. */
function PanelAlertas({ alertas }: { alertas: AlertaStock[] }) {
  return (
    <motion.section
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-6 overflow-hidden"
    >
      <div className="rounded-2xl border border-aviso/25 bg-aviso/[0.06] p-4">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0 text-aviso" aria-hidden />
          <h2 className="text-sm font-medium text-aviso">
            {alertas.length} {alertas.length === 1 ? 'insumo necesita' : 'insumos necesitan'}{' '}
            reposición
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {alertas.map((alerta, indice) => (
            <motion.span
              key={alerta.id}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: indice * 0.04 }}
              className="flex items-center gap-2 rounded-lg border border-aviso/20 bg-superficie/60 px-2.5 py-1.5 text-xs"
            >
              <span className="text-tinta">{alerta.nombre}</span>
              <span className="tabular-nums text-aviso">
                {formatearCantidad(alerta.stockTotal)} / {formatearCantidad(alerta.stockMinimo)}{' '}
                {alerta.unidad}
              </span>
            </motion.span>
          ))}
        </div>

        <p className="mt-3 text-[11px] text-tinta-tenue">
          Las alertas se calculan al consultar, comparando la existencia consolidada contra el stock
          mínimo. Solo los insumos declaran mínimo en el modelo de datos.
        </p>
      </div>
    </motion.section>
  );
}

/**
 * Lotes por vencer dentro del próximo mes (hallazgo A6).
 *
 * Responde la pregunta que el modelo no podía contestar antes: qué insumo hay
 * que usar o retirar primero. El orden es el mismo que sigue el consumo FEFO.
 */
function PanelVencimientos({ lotes }: { lotes: LoteVigente[] }) {
  const vencidos = lotes.filter((l) => l.vencido);

  return (
    <motion.section
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-6 overflow-hidden"
    >
      <div
        className={cn(
          'rounded-2xl border p-4',
          vencidos.length > 0
            ? 'border-peligro/25 bg-peligro/[0.06]'
            : 'border-info/25 bg-info/[0.06]',
        )}
      >
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock
            className={cn('size-4 shrink-0', vencidos.length > 0 ? 'text-peligro' : 'text-info')}
            aria-hidden
          />
          <h2
            className={cn(
              'text-sm font-medium',
              vencidos.length > 0 ? 'text-peligro' : 'text-info',
            )}
          >
            {vencidos.length > 0
              ? `${vencidos.length} lote(s) vencido(s) y ${lotes.length - vencidos.length} por vencer`
              : `${lotes.length} lote(s) vencen en los próximos 30 días`}
          </h2>
        </div>

        <ul className="space-y-1.5">
          {lotes.slice(0, 8).map((lote, indice) => (
            <motion.li
              key={`${lote.idLote}-${lote.idAlmacen}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: indice * 0.04 }}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-borde bg-superficie/60 px-3 py-2 text-xs"
            >
              <span className="text-tinta">{lote.insumo}</span>
              {lote.codigo && (
                <span className="font-mono text-[10px] text-tinta-tenue">{lote.codigo}</span>
              )}
              <span className="tabular-nums text-tinta-suave">
                {formatearCantidad(lote.stock)} {lote.unidad}
              </span>
              <span className="text-tinta-tenue">{lote.almacen}</span>
              <span className="ml-auto shrink-0">
                <Insignia tono={lote.vencido ? 'peligro' : lote.diasParaVencer <= 7 ? 'aviso' : 'info'}>
                  {lote.vencido
                    ? `vencido hace ${Math.abs(lote.diasParaVencer)} d`
                    : lote.diasParaVencer === 0
                      ? 'vence hoy'
                      : `vence en ${lote.diasParaVencer} d`}
                </Insignia>
              </span>
            </motion.li>
          ))}
        </ul>

        {lotes.length > 8 && (
          <p className="mt-2 text-[11px] text-tinta-tenue">
            y {lotes.length - 8} lote(s) más en el mismo periodo
          </p>
        )}

        <p className="mt-3 text-[11px] text-tinta-tenue">
          El consumo sale primero del lote que vence antes, de modo que este listado también indica
          el orden en que se irá usando.
        </p>
      </div>
    </motion.section>
  );
}

function FilaStock({ item, indice }: { item: ExistenciaStock; indice: number }) {
  const esInsumo = item.tipo === 'insumo';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.24, delay: Math.min(indice * 0.025, 0.25), ease: 'easeOut' }}
      className="grid gap-3 px-4 py-3.5 transition-colors duration-200 hover:bg-white/[0.025] md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.6fr)] md:items-center"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg border',
            esInsumo
              ? 'border-info/25 bg-info/10 text-info'
              : 'border-marca-500/25 bg-marca-500/10 text-marca-400',
          )}
        >
          {esInsumo ? <Boxes className="size-4" aria-hidden /> : <Package className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-tinta">{item.nombre}</p>
          <p className="mt-0.5 text-[11px] capitalize text-tinta-tenue">{item.tipo}</p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={cn('text-sm tabular-nums', item.bajoMinimo ? 'text-aviso' : 'text-tinta')}
          >
            {formatearCantidad(item.stockTotal)} {item.unidad}
          </span>
          {item.bajoMinimo && <Insignia tono="aviso">Reponer</Insignia>}
        </div>
        {item.stockMinimo !== null && (
          <>
            <BarraStock stock={item.stockTotal} minimo={item.stockMinimo} className="mt-2" />
            <p className="mt-1 text-[11px] text-tinta-tenue tabular-nums">
              mínimo {formatearCantidad(item.stockMinimo)} {item.unidad}
            </p>
          </>
        )}
      </div>

      <div className="min-w-0">
        {item.existencias.length === 0 ? (
          <span className="text-xs text-tinta-tenue">Sin existencias en ningún almacén</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {item.existencias.map((e) => (
              <span
                key={e.idAlmacen}
                className="inline-flex items-center gap-1.5 rounded-lg border border-borde bg-white/[0.03] px-2 py-1 text-[11px] text-tinta-suave"
              >
                {e.almacen.toLowerCase().includes('refrig') ? (
                  <Snowflake className="size-3 text-info" aria-hidden />
                ) : (
                  <Warehouse className="size-3 text-tinta-tenue" aria-hidden />
                )}
                {e.almacen}
                <span className="tabular-nums text-tinta">{formatearCantidad(e.stock)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.li>
  );
}
