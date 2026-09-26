'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  Factory,
  FileText,
  Loader,
  Plus,
  TriangleAlert,
  User,
} from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { RequierePermiso } from '@/components/RequierePermiso';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { Estadistica } from '@/components/ui/Estadistica';
import { ChipsFiltro } from '@/components/ui/ChipsFiltro';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Paginacion } from '@/components/ui/Paginacion';
import { Insignia } from '@/components/ui/Insignia';
import { Boton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/Dialogo';
import { FormularioOrden } from '@/components/produccion/FormularioOrden';
import { DialogoFinalizar } from '@/components/produccion/DialogoFinalizar';
import type { EstadoOrden, OrdenProduccion, Pagina } from '@/types';
import { ACCION_ORDEN, CONSECUENCIA_ORDEN, FLUJO_ORDEN, TONO_ORDEN } from '@/lib/ordenes';
import { formatearBs, formatearCantidad, formatearFecha } from '@/lib/formato';
import { cn } from '@/lib/cn';
import { useEnlaceDirecto } from '@/components/ui/usarEnlaceDirecto';

type Filtro = EstadoOrden | 'Todas';

/** CU-PRO-02 Gestionar Orden de Producción, con CU-PRO-04 Cancelar Orden. */
export default function PaginaOrdenes() {
  return (
    <RequierePermiso permiso="ORDEN_PRODUCCION_GESTIONAR">
      <TableroOrdenes />
    </RequierePermiso>
  );
}

function TableroOrdenes() {
  const { notificar } = useNotificaciones();

  const [ordenes, setOrdenes] = useState<OrdenProduccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('Todas');
  const [creando, setCreando] = useState(false);
  const [porCancelar, setPorCancelar] = useState<OrdenProduccion | null>(null);
  const [porFinalizar, setPorFinalizar] = useState<OrdenProduccion | null>(null);
  const [ocupada, setOcupada] = useState<number | null>(null);

  /*
   * El listado viene por páginas y el filtro por estado lo aplica el servidor
   * (H7). Los recuentos del tablero se piden aparte: cuentan **todas** las
   * órdenes, no las de la página visible.
   */
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [conteos, setConteos] = useState<Record<string, number>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const parametros = new URLSearchParams({ pagina: String(pagina) });
      if (filtro !== 'Todas') parametros.set('estado', filtro);

      const [respuesta, resumen] = await Promise.all([
        api.get<Pagina<OrdenProduccion>>(`/ordenes?${parametros}`),
        api.get<Record<string, number>>('/ordenes/resumen'),
      ]);

      setOrdenes(respuesta.datos);
      setPaginas(respuesta.paginas);
      setTotal(respuesta.total);
      setConteos(resumen);
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar las órdenes');
    } finally {
      setCargando(false);
    }
  }, [notificar, pagina, filtro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const totalDeTodas = useMemo(
    () => Object.values(conteos).reduce((suma, n) => suma + n, 0),
    [conteos],
  );

  /** Cambiar de filtro vuelve a la primera página: la cuarta puede no existir. */
  function cambiarFiltro(nuevo: Filtro) {
    setFiltro(nuevo);
    setPagina(1);
  }

  /*
   * `?orden=` llega del buscador general. La orden puede no estar en la
   * página visible, así que se pide aparte y se muestra arriba, desplegada.
   */
  const [buscada, setBuscada] = useState<OrdenProduccion | null>(null);
  useEnlaceDirecto(['orden'], ({ orden }) => {
    const id = Number(orden);
    if (!(id > 0)) return;
    api
      .get<OrdenProduccion>(`/ordenes/${id}`)
      .then(setBuscada)
      .catch((e) =>
        notificar('error', e instanceof ErrorApi ? e.message : `No se pudo abrir la orden #${id}`),
      );
  });

  /** La orden cambió: se refleja en la lista y, si es la buscada, también arriba. */
  function reemplazar(actualizada: OrdenProduccion) {
    setOrdenes((actuales) => actuales.map((o) => (o.id === actualizada.id ? actualizada : o)));
    setBuscada((o) => (o?.id === actualizada.id ? actualizada : o));
  }

  /**
   * Finalizar no es un cambio de estado más: exige elegir el almacén de
   * destino del producto terminado.
   */
  function avanzar(orden: OrdenProduccion, destino: EstadoOrden) {
    if (destino === 'Finalizada') return setPorFinalizar(orden);
    void operar(orden, 'iniciar', 'Orden iniciada');
  }


  async function operar(
    orden: OrdenProduccion,
    ruta: string,
    exito: string,
    cuerpo?: unknown,
  ) {
    setOcupada(orden.id);
    try {
      const actualizada = await api.post<OrdenProduccion>(
        `/ordenes/${orden.id}/${ruta}`,
        cuerpo,
      );
      reemplazar(actualizada);
      notificar('exito', exito);
      setPorCancelar(null);
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo completar la operación');
    } finally {
      setOcupada(null);
    }
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Órdenes de producción"
        descripcion="Planifique corridas a partir de la receta activa y registre su ejecución"
        acciones={
          <Boton
            variante="primario"
            onClick={() => setCreando(true)}
            icono={<Plus className="size-4" aria-hidden />}
          >
            Nueva orden
          </Boton>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Estadistica
          indice={0}
          etiqueta="Pendientes"
          valor={conteos['Pendiente'] ?? 0}
          tono="info"
          icono={<FileText className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={1}
          etiqueta="En proceso"
          valor={conteos['En proceso'] ?? 0}
          tono="aviso"
          icono={<Loader className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={2}
          etiqueta="Finalizadas"
          valor={conteos['Finalizada'] ?? 0}
          tono="marca"
          icono={<CheckCircle2 className="size-5" aria-hidden />}
        />
      </div>

      {buscada && (
        <section className="mb-6" aria-label={`Orden buscada #${buscada.id}`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-tinta-tenue">
              Orden buscada
            </p>
            <Boton tamano="sm" variante="fantasma" onClick={() => setBuscada(null)}>
              Quitar
            </Boton>
          </div>
          <ul>
            <TarjetaOrden
              key={`buscada-${buscada.id}`}
              orden={buscada}
              indice={0}
              inicialAbierta
              ocupada={ocupada === buscada.id}
              onAvanzar={(destino) => avanzar(buscada, destino)}
              onCancelar={() => setPorCancelar(buscada)}
            />
          </ul>
        </section>
      )}

      <div className="mb-5">
        <ChipsFiltro<Filtro>
          idGrupo="filtro-ordenes"
          valor={filtro}
          onCambiar={cambiarFiltro}
          opciones={[
            { valor: 'Todas', etiqueta: 'Todas', cantidad: totalDeTodas },
            ...[...FLUJO_ORDEN, 'Cancelada' as EstadoOrden].map((estado) => ({
              valor: estado as Filtro,
              etiqueta: estado,
              cantidad: conteos[estado] ?? 0,
            })),
          ]}
        />
      </div>

      {cargando ? (
        <EsqueletoFilas filas={4} alto="h-28" />
      ) : ordenes.length === 0 ? (
        /* Lo que distingue los dos vacíos es el filtro: antes se preguntaba
           por la lista, que en esta rama siempre está vacía, y filtrar por
           «Cancelada» sin resultados decía «No hay órdenes registradas» y
           ofrecía planificar la primera. */
        <EstadoVacio
          icono={<Factory className="size-6" aria-hidden />}
          titulo={filtro === 'Todas' ? 'No hay órdenes registradas' : 'Sin coincidencias'}
          descripcion={
            filtro === 'Todas'
              ? 'Una orden calcula los insumos según el rendimiento de la receta y, al finalizar, genera las notas de egreso e ingreso.'
              : `No hay órdenes en estado «${filtro}».`
          }
          accion={
            filtro === 'Todas' ? (
              <Boton variante="primario" onClick={() => setCreando(true)}>
                Planificar la primera
              </Boton>
            ) : (
              <Boton variante="contorno" onClick={() => cambiarFiltro('Todas')}>
                Ver todas
              </Boton>
            )
          }
        />
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence mode="popLayout">
            {ordenes.map((orden, indice) => (
              <TarjetaOrden
                key={orden.id}
                orden={orden}
                indice={indice}
                ocupada={ocupada === orden.id}
                onAvanzar={(destino) => avanzar(orden, destino)}
                onCancelar={() => setPorCancelar(orden)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Paginacion
        pagina={pagina}
        paginas={paginas}
        total={total}
        nombre="órdenes"
        onCambiar={setPagina}
      />

      <Dialogo
        abierto={creando}
        onCerrar={() => setCreando(false)}
        ancho="max-w-xl"
        titulo="Nueva orden de producción"
        descripcion="Elija la receta activa y cuántas porciones desea producir"
      >
        <FormularioOrden
          onCancelar={() => setCreando(false)}
          onListo={() => {
            setCreando(false);
            void cargar();
          }}
        />
      </Dialogo>

      <DialogoFinalizar
        orden={porFinalizar}
        onCerrar={() => setPorFinalizar(null)}
        onFinalizado={(actualizada) => {
          reemplazar(actualizada);
          setPorFinalizar(null);
        }}
      />

      <Dialogo
        abierto={porCancelar !== null}
        onCerrar={() => setPorCancelar(null)}
        titulo="Cancelar orden"
        ancho="max-w-md"
      >
        <p className="text-sm text-tinta-suave">
          ¿Confirma cancelar la orden{' '}
          <span className="text-tinta">#{String(porCancelar?.id).padStart(4, '0')}</span> de{' '}
          {porCancelar?.producto.nombre}?
        </p>
        <p className="mt-2 text-xs text-tinta-tenue">
          Cancelar no genera ninguna nota ni modifica el stock: los insumos solo se consumen al
          finalizar la orden.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Boton variante="fantasma" onClick={() => setPorCancelar(null)}>
            Conservar
          </Boton>
          <Boton
            variante="peligro"
            cargando={ocupada !== null}
            onClick={() =>
              porCancelar && operar(porCancelar, 'cancelar', 'Orden cancelada')
            }
          >
            Cancelar orden
          </Boton>
        </div>
      </Dialogo>
    </>
  );
}

function TarjetaOrden({
  orden,
  indice,
  inicialAbierta = false,
  ocupada,
  onAvanzar,
  onCancelar,
}: {
  orden: OrdenProduccion;
  indice: number;
  /** Desplegada desde el principio: la orden que se vino a buscar. */
  inicialAbierta?: boolean;
  ocupada: boolean;
  onAvanzar: (destino: EstadoOrden) => void;
  onCancelar: () => void;
}) {
  const [abierta, setAbierta] = useState(inicialAbierta);
  const siguiente = orden.transicionesPosibles[0] ?? null;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.28, delay: Math.min(indice * 0.04, 0.3), ease: 'easeOut' }}
      className="superficie-tarjeta overflow-hidden rounded-2xl"
    >
      <button
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.025]"
      >
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl border',
            orden.estado === 'Finalizada'
              ? 'border-marca-500/25 bg-marca-500/10 text-marca-400'
              : orden.estado === 'Cancelada'
                ? 'border-peligro/25 bg-peligro/10 text-peligro'
                : 'border-borde bg-white/[0.03] text-tinta-suave',
          )}
        >
          <Factory className="size-5" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-tinta-tenue">
              OP-{String(orden.id).padStart(4, '0')}
            </span>
            <Insignia tono={TONO_ORDEN[orden.estado]} punto={orden.estado === 'En proceso'}>
              {orden.estado}
            </Insignia>
          </div>
          <p className="mt-1 truncate text-sm text-tinta">
            {orden.cantidad} × {orden.producto.nombre}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-tinta-tenue">
            <User className="size-3" aria-hidden />
            {orden.registradoPor.nombreCompleto} · {formatearFecha(orden.fecha)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Con su rótulo: suelto, el importe se confundía con un precio de venta. */}
          <span className="hidden text-right sm:block">
            <span className="block text-[10px] uppercase tracking-wider text-tinta-tenue">
              {orden.estado === 'Finalizada' ? 'Costo' : 'Costo estimado'}
            </span>
            <span className="text-sm tabular-nums text-tinta-suave">
              {formatearBs(orden.costoEstimado)}
            </span>
          </span>
          <motion.span
            animate={{ rotate: abierta ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-tinta-tenue"
          >
            <ChevronDown className="size-4" aria-hidden />
          </motion.span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {abierta && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="overflow-hidden border-t border-borde"
          >
            <div className="space-y-4 px-4 py-4">
              <div className="flex flex-wrap gap-2 text-[11px] text-tinta-tenue">
                <span className="rounded-lg border border-borde bg-white/[0.02] px-2 py-1">
                  Receta: {orden.receta.nombre}
                </span>
                <span className="rounded-lg border border-borde bg-white/[0.02] px-2 py-1">
                  Rinde {orden.receta.rendimiento} por corrida
                </span>
                {orden.fechaFinalizacion && (
                  <span className="rounded-lg border border-borde bg-white/[0.02] px-2 py-1">
                    Finalizada el {formatearFecha(orden.fechaFinalizacion)}
                  </span>
                )}
                {orden.almacenDestino && (
                  <span className="rounded-lg border border-borde bg-white/[0.02] px-2 py-1">
                    Destino: {orden.almacenDestino.nombre}
                  </span>
                )}
                {orden.costoUnitario !== null && (
                  <span className="rounded-lg border border-borde bg-white/[0.02] px-2 py-1">
                    {formatearBs(orden.costoUnitario)} por unidad
                  </span>
                )}
              </div>

              {/*
                Lo que salió de verdad (H10). Solo aparece cuando difiere de lo
                planificado: repetir «4 de 4» en cada orden sería ruido.
              */}
              {orden.merma !== null && orden.merma > 0 && (
                <p className="flex items-start gap-2 rounded-xl border border-aviso/25 bg-aviso/10 px-3.5 py-2.5 text-xs leading-relaxed text-aviso">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    Se planificaron {orden.cantidad} y salieron {orden.cantidadObtenida}:{' '}
                    {orden.merma} de merma. Los insumos se consumieron por la corrida completa.
                  </span>
                </p>
              )}

              <div>
                {/*
                  Para una orden finalizada esto es lo que se consumió de
                  verdad, leído de su nota de egreso; antes de ejecutar es la
                  previsión de la receta (H6). El título lo dice, porque no son
                  el mismo dato.
                */}
                <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
                  {orden.estado === 'Finalizada' ? 'Insumos consumidos' : 'Insumos requeridos'}
                </h4>
                <ul className="space-y-1.5">
                  {orden.insumosRequeridos.map((insumo) => (
                    <li
                      key={insumo.idIngrediente}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate text-tinta-suave">{insumo.nombre}</span>
                      <span className="shrink-0 tabular-nums text-tinta">
                        {formatearCantidad(insumo.cantidadRequerida)} {insumo.unidad}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {(orden.notas.egreso || orden.notas.ingreso) && (
                <div className="flex flex-wrap gap-2">
                  {orden.notas.egreso && (
                    <Insignia tono="peligro">Egreso EGR-{String(orden.notas.egreso).padStart(4, '0')}</Insignia>
                  )}
                  {orden.notas.ingreso && (
                    <Insignia tono="marca">Ingreso ING-{String(orden.notas.ingreso).padStart(4, '0')}</Insignia>
                  )}
                </div>
              )}

              {siguiente && (
                <div className="rounded-xl border border-borde bg-white/[0.02] p-3">
                  <p className="mb-3 text-xs leading-relaxed text-tinta-tenue">
                    {CONSECUENCIA_ORDEN[siguiente]}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Boton
                      variante="primario"
                      tamano="sm"
                      cargando={ocupada}
                      onClick={() => onAvanzar(siguiente)}
                    >
                      {ACCION_ORDEN[siguiente] ?? `Pasar a ${siguiente}`}
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Boton>
                    {orden.cancelable && (
                      <Boton
                        variante="peligro"
                        tamano="sm"
                        onClick={onCancelar}
                        icono={<Ban className="size-3.5" aria-hidden />}
                      >
                        Cancelar
                      </Boton>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
