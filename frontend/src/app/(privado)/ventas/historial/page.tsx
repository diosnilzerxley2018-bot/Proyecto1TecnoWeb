'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Armchair, Ban, ChevronDown, Receipt, ShoppingBag, User } from 'lucide-react';
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
import { DialogoAnularVenta } from '@/components/ventas/DialogoAnularVenta';
import { Boton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/Dialogo';
import { Comprobante } from '@/components/ventas/Comprobante';
import type { Comprobante as ComprobanteDatos, Pagina, TipoVenta, Venta } from '@/types';
import { formatearBs, formatearFecha } from '@/lib/formato';
import { useEnlaceDirecto } from '@/components/ui/usarEnlaceDirecto';

type Filtro = 'todas' | TipoVenta;

/** CU-VEN-01 — consulta de las ventas registradas. */
export default function PaginaHistorial() {
  return (
    <RequierePermiso permiso="VENTA_LEER">
      <Historial />
    </RequierePermiso>
  );
}

function Historial() {
  const { notificar } = useNotificaciones();

  const [ventas, setVentas] = useState<Venta[]>([]);
  const [aAnular, setAAnular] = useState<Venta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [comprobante, setComprobante] = useState<ComprobanteDatos | null>(null);

  /*
   * El listado viene por páginas (H7). Antes traía la tabla entera y filtraba
   * en el navegador; con miles de ventas eso es una consulta sin techo y un
   * JSON que crece hasta que el navegador se cansa. **El filtro pasó al
   * servidor** por la misma razón: filtrar una página deja fuera las ventas
   * que están en las otras.
   */
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const parametros = new URLSearchParams({ pagina: String(pagina) });
      if (filtro !== 'todas') parametros.set('tipo', filtro);

      const respuesta = await api.get<Pagina<Venta>>(`/ventas?${parametros}`);
      setVentas(respuesta.datos);
      setPaginas(respuesta.paginas);
      setTotal(respuesta.total);
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar las ventas');
    } finally {
      setCargando(false);
    }
  }, [notificar, pagina, filtro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Cambiar de filtro vuelve a la primera página: la cuarta puede no existir. */
  function cambiarFiltro(nuevo: Filtro) {
    setFiltro(nuevo);
    setPagina(1);
  }

  /** De la página visible; el total lo dice el pie del listado. */
  /** Lo anulado no se recaudó: su dinero se devolvió y su stock volvió al almacén. */
  const recaudadoVisible = useMemo(
    () => ventas.reduce((suma, v) => (v.estadoPago === 'Anulado' ? suma : suma + v.total), 0),
    [ventas],
  );

  // `?venta=` llega del buscador general: abre el comprobante, esté en la página que esté.
  useEnlaceDirecto(['venta'], ({ venta }) => {
    if (Number(venta) > 0) void verComprobante(Number(venta));
  });

  async function verComprobante(idVenta: number) {
    try {
      setComprobante(await api.get<ComprobanteDatos>(`/ventas/${idVenta}/comprobante`));
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo generar el comprobante');
    }
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Historial de ventas"
        descripcion="Ventas registradas en el local, con su comprobante"
      />

      {/*
        Dos cifras, y las dos dicen de qué son. Antes sumaban el array entero
        —que era todo el histórico— y con páginas eso pasaría a ser «lo que se
        ve», etiquetado como si fuera el negocio completo. Las cifras del
        período viven en Reportes, que es la pantalla que existe para eso.
      */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Estadistica
          indice={0}
          etiqueta={filtro === 'todas' ? 'Ventas registradas' : `Ventas ${filtro}`}
          valor={total}
          tono="marca"
          icono={<Receipt className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={1}
          etiqueta="Recaudado en esta página"
          valor={formatearBs(recaudadoVisible)}
          tono="violeta"
          icono={<ShoppingBag className="size-5" aria-hidden />}
        />
      </div>

      <div className="mb-5">
        {/* Sin cantidades: contarlas exigiría una consulta por cada chip, y un
            número que solo cuenta la página visible confunde más que ayuda. */}
        <ChipsFiltro<Filtro>
          idGrupo="filtro-ventas"
          valor={filtro}
          onCambiar={cambiarFiltro}
          opciones={[
            { valor: 'todas', etiqueta: 'Todas' },
            { valor: 'Mesa', etiqueta: 'En mesa' },
            { valor: 'Llevar', etiqueta: 'Para llevar' },
          ]}
        />
      </div>

      {cargando ? (
        <EsqueletoFilas filas={5} alto="h-20" />
      ) : ventas.length === 0 ? (
        <EstadoVacio
          icono={<Receipt className="size-6" aria-hidden />}
          titulo="Sin ventas registradas"
          descripcion="Las ventas que registre en el punto de venta aparecerán aquí con su comprobante."
        />
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence mode="popLayout">
            {ventas.map((venta, indice) => (
              <TarjetaVenta
                onAnular={() => setAAnular(venta)}
                key={venta.id}
                venta={venta}
                indice={indice}
                onComprobante={() => verComprobante(venta.id)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Paginacion
        pagina={pagina}
        paginas={paginas}
        total={total}
        nombre="ventas"
        onCambiar={setPagina}
      />

      <Dialogo
        abierto={comprobante !== null}
        onCerrar={() => setComprobante(null)}
        titulo="Comprobante"
        ancho="max-w-md"
      >
        {comprobante && (
          <Comprobante datos={comprobante} onCerrar={() => setComprobante(null)} />
        )}
      </Dialogo>
      <DialogoAnularVenta
        venta={aAnular}
        onCerrar={() => setAAnular(null)}
        onAnulada={(resultado) => {
          setVentas((actuales) =>
            actuales.map((v) => (v.id === resultado.venta.id ? resultado.venta : v)),
          );
          setAAnular(null);
          notificar(
            resultado.requiereDevolucion ? 'info' : 'exito',
            resultado.aviso ?? 'Venta anulada: el stock volvió al inventario',
          );
        }}
      />
    </>
  );
}

function TarjetaVenta({
  venta,
  indice,
  onComprobante,
  onAnular,
}: {
  venta: Venta;
  indice: number;
  onComprobante: () => void;
  onAnular: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const enMesa = venta.tipoVenta === 'Mesa';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.28, delay: Math.min(indice * 0.035, 0.3), ease: 'easeOut' }}
      className="superficie-tarjeta overflow-hidden rounded-2xl"
    >
      <button
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.025]"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-borde bg-white/[0.03] text-tinta-suave">
          {enMesa ? <Armchair className="size-5" aria-hidden /> : <ShoppingBag className="size-5" aria-hidden />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-tinta-tenue">
              V-{String(venta.id).padStart(6, '0')}
            </span>
            <Insignia tono={enMesa ? 'info' : 'violeta'}>
              {enMesa ? 'En mesa' : 'Para llevar'}
            </Insignia>
            <Insignia tono="neutro">{venta.metodoPago}</Insignia>
            {venta.estadoPago !== 'Pagado' && (
              <Insignia tono={venta.estadoPago === 'Anulado' ? 'peligro' : 'aviso'}>
                {venta.estadoPago}
              </Insignia>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-tinta-tenue">
            <User className="size-3" aria-hidden />
            {venta.cliente?.nombreCompleto ?? 'Consumidor final'} · {formatearFecha(venta.fecha)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm font-semibold tabular-nums text-tinta">
            {formatearBs(venta.total)}
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
            <ul className="divide-y divide-borde">
              {venta.items.map((item) => (
                <li
                  /* Un mismo producto puede aparecer dos veces: una por cada
                     almacén del que salió. Aquí el desglose es el dato que se
                     quiere ver, así que la clave incluye el almacén. */
                  key={`${item.idProducto}-${item.almacen}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-tinta">{item.nombre}</p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-tinta-tenue">
                      {item.cantidad} × {formatearBs(item.precioUnitario)} · {item.almacen}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-tinta-suave">
                    {formatearBs(item.subtotal)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-3 bg-white/[0.02] px-4 py-3">
              <span className="text-[11px] text-tinta-tenue">
                Atendió {venta.atendidoPor.nombreCompleto}
              </span>
              <div className="flex shrink-0 gap-2">
                {venta.estadoPago !== 'Anulado' && (
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    onClick={onAnular}
                    icono={<Ban className="size-3.5" aria-hidden />}
                  >
                    Anular
                  </Boton>
                )}
                <Boton
                  variante="contorno"
                  tamano="sm"
                  onClick={onComprobante}
                  icono={<Receipt className="size-3.5" aria-hidden />}
                >
                  Ver comprobante
                </Boton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
