'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Boxes, CalendarClock, Layers, Package } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { useRetardo } from '@/components/ui/usarRetardo';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { ChipsFiltro } from '@/components/ui/ChipsFiltro';
import { Campo } from '@/components/ui/Campo';
import { Selector } from '@/components/ui/Selector';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Paginacion } from '@/components/ui/Paginacion';
import { Insignia } from '@/components/ui/Insignia';
import { TablaReporte } from '@/components/reportes/PiezasReporte';
import type {
  LineaMovimiento,
  LoteDeIngreso,
  LoteDeVencimiento,
  NotaIngreso,
  Pagina,
  PaginaLotes,
  ResumenLotesItem,
  TipoItem,
} from '@/types';
import {
  detalleDeIngreso,
  ETIQUETA_MOTIVO,
  formatearVencimiento,
  numeroDeIngreso,
  TONO_MOTIVO,
} from '@/lib/inventario';
import { formatearBs, formatearCantidad, formatearFecha } from '@/lib/formato';
import { coincide } from '@/lib/texto';
import { cn } from '@/lib/cn';

/**
 * Inventario › Lotes.
 *
 * El costo de un insumo es el promedio de sus compras, y el de un producto, el
 * de sus ingresos: ninguno dice a cuánto se pagó cada entrada. Aquí sí. Un
 * **lote** es lo que entró junto en una nota de ingreso —una compra, una
 * reposición, una orden de producción—, y su número es el de la nota.
 *
 * - **Por lote**: cada nota con todo lo que trajo, al precio de esa entrada.
 * - **Por ítem**: cada entrada de un insumo o producto por separado. Buscando
 *   uno, arriba se resume cuánto varió su precio de un lote a otro.
 *
 * Los dos se buscan en el servidor —por nombre, sin tildes, palabra por
 * palabra— y se paginan: el historial de compras crece sin techo.
 */

type Vista = 'lote' | 'item';
type FiltroTipo = 'todos' | TipoItem;

/** Lo que puede originar un lote. «Todos» viaja como vacío. */
const ORIGENES = ['', 'Compra', 'Reposicion', 'Produccion', 'Ajuste', 'Devolucion'];

export default function PaginaLotes() {
  const { notificar } = useNotificaciones();

  const [vista, setVista] = useState<Vista>('lote');
  const [tipo, setTipo] = useState<FiltroTipo>('todos');
  const [motivo, setMotivo] = useState('');
  /** Rango de fechas de la entrada; vacío, sin límite. */
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const termino = useRetardo(busqueda.trim());
  const [pagina, setPagina] = useState(1);

  const [notas, setNotas] = useState<Pagina<NotaIngreso> | null>(null);
  const [lotes, setLotes] = useState<PaginaLotes | null>(null);
  const [cargando, setCargando] = useState(true);

  /**
   * Número de la última consulta. Se escribe rápido y se cambia de vista:
   * una respuesta vieja no debe pisar a la nueva.
   */
  const ultimaConsulta = useRef(0);

  const cargar = useCallback(async () => {
    const numero = ++ultimaConsulta.current;
    setCargando(true);
    const parametros = new URLSearchParams({ pagina: String(pagina) });
    if (termino) parametros.set('termino', termino);
    if (tipo !== 'todos') parametros.set('tipo', tipo);
    if (motivo) parametros.set('motivo', motivo);
    if (desde) parametros.set('desde', desde);
    if (hasta) parametros.set('hasta', hasta);

    try {
      if (vista === 'lote') {
        const respuesta = await api.get<Pagina<NotaIngreso>>(`/ingresos?${parametros}`);
        if (numero !== ultimaConsulta.current) return;
        setNotas(respuesta);
      } else {
        const respuesta = await api.get<PaginaLotes>(`/ingresos/lotes?${parametros}`);
        if (numero !== ultimaConsulta.current) return;
        setLotes(respuesta);
      }
    } catch (e) {
      if (numero !== ultimaConsulta.current) return;
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar los lotes');
    } finally {
      if (numero === ultimaConsulta.current) setCargando(false);
    }
  }, [vista, tipo, motivo, desde, hasta, termino, pagina, notificar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Cambiar un filtro vuelve a la primera página: la quinta puede no existir. */
  function filtrar(cambio: () => void) {
    cambio();
    setPagina(1);
  }

  const actual = vista === 'lote' ? notas : lotes;
  const vacio = !cargando && actual !== null && actual.datos.length === 0;

  return (
    <>
      <EncabezadoPagina
        titulo="Lotes"
        descripcion="Cada ingreso es un lote: lo que entró junto y cuánto costó cada unidad"
      />

      <section className="superficie-tarjeta mb-5 space-y-4 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ChipsFiltro<Vista>
            idGrupo="vista-lotes"
            valor={vista}
            onCambiar={(v) => filtrar(() => setVista(v))}
            opciones={[
              { valor: 'lote', etiqueta: 'Por lote' },
              { valor: 'item', etiqueta: 'Por ítem' },
            ]}
          />
          <ChipsFiltro<FiltroTipo>
            idGrupo="tipo-lotes"
            valor={tipo}
            onCambiar={(v) => filtrar(() => setTipo(v))}
            opciones={[
              { valor: 'todos', etiqueta: 'Todos' },
              { valor: 'insumo', etiqueta: 'Insumos' },
              { valor: 'producto', etiqueta: 'Productos' },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <Campo
            etiqueta="Buscar insumo o producto"
            placeholder="Aceite, harina, agua…"
            value={busqueda}
            onChange={(e) => filtrar(() => setBusqueda(e.target.value))}
          />
          <Selector<string>
            etiqueta="Origen"
            valor={motivo}
            onCambiar={(v) => filtrar(() => setMotivo(v))}
            opciones={ORIGENES.map((m) => ({
              valor: m,
              etiqueta: m === '' ? 'Todos los orígenes' : ETIQUETA_MOTIVO[m],
            }))}
          />
          <Campo
            etiqueta="Desde"
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => filtrar(() => setDesde(e.target.value))}
          />
          <Campo
            etiqueta="Hasta"
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => filtrar(() => setHasta(e.target.value))}
          />
        </div>
      </section>

      {cargando && actual === null ? (
        <EsqueletoFilas filas={5} alto="h-24" />
      ) : vacio ? (
        <EstadoVacio
          icono={<Layers className="size-6" aria-hidden />}
          titulo={termino ? `Ningún lote de «${termino}»` : 'Todavía no hay lotes'}
          descripcion="Cada nota de ingreso —una compra, una reposición, una orden de producción— forma un lote con el precio de esa entrada."
        />
      ) : vista === 'lote' && notas ? (
        <ul className={cn('space-y-3 transition-opacity', cargando && 'opacity-60')}>
          <AnimatePresence mode="popLayout">
            {notas.datos.map((nota, indice) => (
              <TarjetaLote key={nota.id} nota={nota} termino={termino} indice={indice} />
            ))}
          </AnimatePresence>
        </ul>
      ) : lotes ? (
        <div className={cn('space-y-4 transition-opacity', cargando && 'opacity-60')}>
          {lotes.resumen.length > 0 && <ResumenPrecios resumen={lotes.resumen} />}
          <TablaReporte<LoteDeIngreso>
            titulo="Entradas"
            filas={lotes.datos}
            clave={(l) => `${l.idNota}-${l.tipo}-${l.id}-${l.idAlmacen}`}
            columnas={[
              {
                titulo: 'Lote',
                celda: (l) => (
                  <>
                    <span className="font-mono text-xs text-tinta">{numeroDeIngreso(l.idNota)}</span>
                    <span className="block text-[11px] text-tinta-tenue">
                      {formatearFecha(l.fecha)}
                    </span>
                  </>
                ),
              },
              {
                titulo: 'Ítem',
                celda: (l) => (
                  <span className="flex items-center gap-2 text-tinta">
                    <IconoItem tipo={l.tipo} />
                    {l.nombre}
                  </span>
                ),
              },
              {
                titulo: 'Origen',
                celda: (l) => (
                  <>
                    <Insignia tono={TONO_MOTIVO[l.motivo] ?? 'neutro'}>
                      {ETIQUETA_MOTIVO[l.motivo] ?? l.motivo}
                    </Insignia>
                    {detalleDeIngreso(l) && (
                      <span className="mt-1 block text-[11px] text-tinta-tenue">
                        {detalleDeIngreso(l)}
                      </span>
                    )}
                  </>
                ),
              },
              { titulo: 'Almacén', celda: (l) => l.almacen },
              {
                titulo: 'Cantidad',
                numerica: true,
                celda: (l) => `${formatearCantidad(l.cantidad)} ${l.unidad}`,
              },
              {
                titulo: 'Costo unitario',
                numerica: true,
                celda: (l) => (
                  <span className="font-medium text-marca-300">
                    {formatearBs(l.costoUnitario)}
                    <span className="text-tinta-tenue"> /{l.unidad}</span>
                  </span>
                ),
              },
              { titulo: 'Subtotal', numerica: true, celda: (l) => formatearBs(l.subtotal) },
              {
                titulo: 'Vencimiento',
                celda: (l) => (l.lote ? <DatoVencimiento lote={l.lote} unidad={l.unidad} /> : '—'),
              },
            ]}
          />
        </div>
      ) : null}

      <Paginacion
        pagina={pagina}
        paginas={actual?.paginas ?? 1}
        total={actual?.total ?? 0}
        nombre={vista === 'lote' ? 'lotes' : 'entradas'}
        onCambiar={setPagina}
      />
    </>
  );
}

function IconoItem({ tipo }: { tipo: TipoItem }) {
  return tipo === 'insumo' ? (
    <Boxes className="size-4 shrink-0 text-info" aria-label="Insumo" />
  ) : (
    <Package className="size-4 shrink-0 text-marca-400" aria-label="Producto" />
  );
}

/** El lote de vencimiento de un perecedero: qué vence, cuándo y cuánto queda. */
function DatoVencimiento({ lote, unidad }: { lote: LoteDeVencimiento; unidad: string }) {
  return (
    <span className="inline-flex items-start gap-1.5 text-[11px] leading-snug text-tinta-suave">
      <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />
      <span>
        {lote.codigo ? `Lote ${lote.codigo} · ` : ''}vence {formatearVencimiento(lote.vencimiento)}
        <span className="block text-tinta-tenue">
          {lote.queda > 0 ? `quedan ${formatearCantidad(lote.queda)} ${unidad}` : 'ya no queda'}
        </span>
      </span>
    </span>
  );
}

/** Un lote: una nota de ingreso con todo lo que entró junto, al precio de esa entrada. */
function TarjetaLote({
  nota,
  termino,
  indice,
}: {
  nota: NotaIngreso;
  termino: string;
  indice: number;
}) {
  const detalle = detalleDeIngreso(nota);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.26, delay: Math.min(indice * 0.035, 0.3), ease: 'easeOut' }}
      className="superficie-tarjeta overflow-hidden rounded-2xl"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-borde px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-marca-500/25 bg-marca-500/10 text-marca-400">
          <Layers className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-tinta">Lote {numeroDeIngreso(nota.id)}</span>
            <Insignia tono={TONO_MOTIVO[nota.motivo] ?? 'neutro'}>
              {ETIQUETA_MOTIVO[nota.motivo] ?? nota.motivo}
            </Insignia>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-tinta-tenue">
            {[formatearFecha(nota.fecha), detalle].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums text-tinta">
          {formatearBs(nota.total)}
        </span>
      </div>

      <ul className="divide-y divide-borde">
        {nota.lineas.map((linea) => (
          <LineaLote
            key={`${linea.tipo}-${linea.id}-${linea.idAlmacen}`}
            linea={linea}
            buscada={termino !== '' && coincide(linea.nombre, termino)}
          />
        ))}
      </ul>
    </motion.li>
  );
}

function LineaLote({ linea, buscada }: { linea: LineaMovimiento; buscada: boolean }) {
  return (
    <li className={cn('flex items-start gap-3 px-4 py-2.5', buscada && 'bg-marca-500/[0.06]')}>
      <span className="mt-0.5">
        <IconoItem tipo={linea.tipo} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', buscada ? 'font-medium text-tinta' : 'text-tinta')}>
          {linea.nombre}
        </p>
        <p className="mt-0.5 text-[11px] text-tinta-tenue">{linea.almacen}</p>
        {linea.lote && (
          <div className="mt-1">
            <DatoVencimiento lote={linea.lote} unidad={linea.unidad} />
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm tabular-nums text-tinta">
          {formatearCantidad(linea.cantidad)} {linea.unidad}
          {linea.costoUnitario !== null && (
            <span className="text-tinta-tenue">
              {' '}
              × <span className="text-marca-300">{formatearBs(linea.costoUnitario)}</span>
            </span>
          )}
        </p>
        {linea.subtotal !== null && (
          <p className="mt-0.5 text-[11px] tabular-nums text-tinta-tenue">
            {formatearBs(linea.subtotal)}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * Cuánto varió el precio de cada ítem buscado: es lo que responde «¿a cuánto
 * compramos el aceite?» sin recorrer la tabla.
 */
function ResumenPrecios({ resumen }: { resumen: ResumenLotesItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {resumen.map((r) => (
        <div key={`${r.tipo}-${r.id}`} className="superficie-tarjeta rounded-2xl p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-tinta">
            <IconoItem tipo={r.tipo} />
            <span className="truncate">{r.nombre}</span>
          </p>
          <p className="mt-1 text-[11px] text-tinta-tenue">
            {r.lotes === 1 ? '1 lote' : `${r.lotes} lotes`} · {formatearCantidad(r.cantidad)}{' '}
            {r.unidad} en total
          </p>
          <p className="mt-2 text-lg font-semibold tabular-nums text-marca-300">
            {r.costoMinimo === r.costoMaximo
              ? formatearBs(r.costoMinimo)
              : `${formatearBs(r.costoMinimo)} a ${formatearBs(r.costoMaximo)}`}
            <span className="text-xs font-normal text-tinta-tenue"> por {r.unidad}</span>
          </p>
          <p className="mt-1 text-[11px] text-tinta-suave">
            Último lote: {formatearBs(r.costoUltimo)}
            {r.costoActual !== null && ` · Costo actual: ${formatearBs(r.costoActual)}`}
          </p>
        </div>
      ))}
    </div>
  );
}
