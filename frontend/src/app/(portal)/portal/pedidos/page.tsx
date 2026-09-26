'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, MapPin, ReceiptText, ShoppingBasket, Wallet, XCircle } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Insignia } from '@/components/ui/Insignia';
import { Boton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/Dialogo';
import { DialogoCobro } from '@/components/ventas/DialogoCobro';
import { LineaDeTiempo } from '@/components/pedidos/LineaDeTiempo';
import { MapaUbicacion } from '@/components/pedidos/MapaUbicacion';
import { SeguimientoEnVivo } from '@/components/pedidos/SeguimientoEnVivo';
import type { Coordenadas } from '@/lib/dominio';
import type { Pago, PedidoCliente } from '@/types';
import { ETIQUETA_ESTADO, TONO_ESTADO, textoDePago } from '@/lib/pedidos';
import { useRefrescoPeriodico } from '@/components/ui/usarRefrescoPeriodico';
import { formatearBs, formatearFecha } from '@/lib/formato';

/** CU-PED-02 — consulta y cancelación de los pedidos propios. */
export default function PaginaMisPedidos() {
  const { notificar } = useNotificaciones();

  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [porCancelar, setPorCancelar] = useState<PedidoCliente | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [cobro, setCobro] = useState<Pago | null>(null);
  const [abriendoCobro, setAbriendoCobro] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      setPedidos(await api.get<PedidoCliente[]>('/pedidos'));
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar sus pedidos');
    } finally {
      setCargando(false);
    }
  }, [notificar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /*
   * El seguimiento se actualiza solo mientras haya algún pedido en curso.
   * Antes el cliente tenía que recargar la página para ver que su pedido había
   * salido; con todos entregados o cancelados no hay nada que vigilar.
   */
  const hayEnCurso = pedidos.some(
    (p) => p.estadoPedido !== 'Entregado' && p.estadoPedido !== 'Cancelado',
  );
  useRefrescoPeriodico(cargar, 20_000, hayEnCurso);

  /**
   * Retoma un pago que quedó a medias.
   *
   * El código de cobro no viaja en el listado —dibujarlo cuesta y casi ningún
   * pedido lo necesita—, así que se pide el pedido completo justo al pulsar.
   */
  async function retomarPago(pedido: PedidoCliente) {
    setAbriendoCobro(pedido.id);
    try {
      const completo = await api.get<PedidoCliente>(`/pedidos/${pedido.id}`);
      if (!completo.cobro) {
        notificar('error', 'Este pedido ya no tiene un cobro abierto');
        await cargar();
        return;
      }
      setCobro(completo.cobro);
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo abrir el cobro');
    } finally {
      setAbriendoCobro(null);
    }
  }

  async function cancelar() {
    if (!porCancelar) return;
    setCancelando(true);
    try {
      const actualizado = await api.post<PedidoCliente>(`/pedidos/${porCancelar.id}/cancelar`);
      setPedidos((actuales) =>
        actuales.map((p) => (p.id === actualizado.id ? actualizado : p)),
      );
      // Al cliente no le dice nada "el stock volvió al inventario": eso es
      // asunto del local. Lo que le importa es que quedó cancelado y sin cobro.
      notificar('exito', `Pedido #${String(actualizado.id).padStart(5, '0')} cancelado`);
      setPorCancelar(null);
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo cancelar el pedido');
    } finally {
      setCancelando(false);
    }
  }

  return (
    <>
      <header className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-tinta">Mis pedidos</h1>
        <p className="mt-1.5 text-sm text-tinta-tenue">
          Siga el estado de cada pedido hasta que llegue a su puerta
        </p>
      </header>

      {cargando ? (
        <EsqueletoFilas filas={3} alto="h-28" />
      ) : pedidos.length === 0 ? (
        <EstadoVacio
          icono={<ReceiptText className="size-6" aria-hidden />}
          titulo="Todavía no ha hecho ningún pedido"
          descripcion="Cuando confirme su primer pedido aparecerá aquí, con su estado actualizado en cada paso."
          accion={
            <Link href="/portal">
              <Boton variante="primario" icono={<ShoppingBasket className="size-4" aria-hidden />}>
                Ver el catálogo
              </Boton>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          <AnimatePresence mode="popLayout">
            {pedidos.map((pedido, indice) => (
              <TarjetaPedidoCliente
                key={pedido.id}
                pedido={pedido}
                indice={indice}
                abriendoCobro={abriendoCobro === pedido.id}
                onPagar={() => void retomarPago(pedido)}
                onCancelar={() => setPorCancelar(pedido)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Dialogo
        abierto={porCancelar !== null}
        onCerrar={() => setPorCancelar(null)}
        titulo="Cancelar pedido"
        ancho="max-w-md"
      >
        <p className="text-sm text-tinta-suave">
          ¿Confirma cancelar el pedido{' '}
          <span className="text-tinta">#{String(porCancelar?.id).padStart(5, '0')}</span>?
        </p>
        <p className="mt-2 text-xs text-tinta-tenue">
          {porCancelar?.estadoPago === 'Pagado'
            ? 'Como ya lo pagó en línea, el reembolso se gestiona aparte.'
            : 'No se le cobrará nada.'}{' '}
          Un pedido puede cancelarse mientras no haya salido a reparto.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Boton variante="fantasma" onClick={() => setPorCancelar(null)}>
            Conservar pedido
          </Boton>
          <Boton variante="peligro" cargando={cancelando} onClick={cancelar}>
            Cancelar pedido
          </Boton>
        </div>
      </Dialogo>

      <DialogoCobro
        pago={cobro}
        onCerrar={() => {
          setCobro(null);
          // El estado pudo cambiar mientras el diálogo consultaba la pasarela.
          void cargar();
        }}
        onPagado={() => notificar('exito', 'Pago acreditado. Su pedido entró a preparación')}
      />
    </>
  );
}

function TarjetaPedidoCliente({
  pedido,
  indice,
  abriendoCobro,
  onPagar,
  onCancelar,
}: {
  pedido: PedidoCliente;
  indice: number;
  abriendoCobro: boolean;
  onPagar: () => void;
  onCancelar: () => void;
}) {
  const [abierto, setAbierto] = useState(indice === 0);

  /** Único estado en el que queda dinero por cobrar en línea. */
  const esperaPago = pedido.estadoPedido === 'Pendiente de pago';
  const pago = textoDePago(pedido, 'cliente');

  const puntoEntrega: Coordenadas | null =
    pedido.ubicacion.latitud !== null && pedido.ubicacion.longitud !== null
      ? { lat: pedido.ubicacion.latitud, lon: pedido.ubicacion.longitud }
      : null;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, delay: Math.min(indice * 0.05, 0.3), ease: 'easeOut' }}
      className="superficie-tarjeta overflow-hidden rounded-2xl"
    >
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.025]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-tinta-tenue">
              #{String(pedido.id).padStart(5, '0')}
            </span>
            <Insignia
              tono={TONO_ESTADO[pedido.estadoPedido]}
              punto={pedido.estadoPedido === 'En camino'}
            >
              {ETIQUETA_ESTADO[pedido.estadoPedido]}
            </Insignia>
          </div>
          <p className="mt-1.5 text-xs text-tinta-tenue">{formatearFecha(pedido.fecha)}</p>
        </div>

        <span className="shrink-0 text-base font-semibold tabular-nums text-tinta">
          {formatearBs(pedido.total)}
        </span>

        <motion.span
          animate={{ rotate: abierto ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-tinta-tenue"
        >
          <ChevronDown className="size-4" aria-hidden />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: 'easeOut' }}
            className="overflow-hidden border-t border-borde"
          >
            <div className="space-y-5 px-5 py-5">
              <LineaDeTiempo pedido={pedido} para="cliente" />

              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5 text-xs text-tinta-suave">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-tinta-tenue" aria-hidden />
                  <span>
                    {[pedido.ubicacion.calle, pedido.ubicacion.numero, pedido.ubicacion.referencia]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>

                {/*
                  En camino, el mapa muestra también por dónde viene el
                  repartidor: el cliente sabe si de verdad está en camino sin
                  llamar a nadie. Antes, solo el punto elegido, y únicamente
                  si lo marcó: confirma a dónde irá el repartidor.
                */}
                {pedido.estadoPedido === 'En camino' ? (
                  <SeguimientoEnVivo
                    ruta={`/pedidos/${pedido.id}/seguimiento`}
                    destino={puntoEntrega}
                    para="cliente"
                  />
                ) : (
                  puntoEntrega && <MapaUbicacion valor={puntoEntrega} altura="h-64 sm:h-72" />
                )}
              </div>

              <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde">
                {pedido.items.map((item) => (
                  <li
                    key={item.idProducto}
                    className="flex items-center justify-between gap-3 bg-white/[0.02] px-3.5 py-2.5"
                  >
                    <span className="min-w-0 truncate text-sm text-tinta">
                      <span className="tabular-nums text-tinta-tenue">{item.cantidad}×</span>{' '}
                      {item.nombre}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-tinta-suave">
                      {formatearBs(item.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Insignia tono={pago.tono}>{pago.texto}</Insignia>
                  {pedido.referenciaPago && (
                    <Insignia tono="neutro">Ref. {pedido.referenciaPago}</Insignia>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {esperaPago && (
                    <Boton
                      variante="primario"
                      tamano="sm"
                      cargando={abriendoCobro}
                      onClick={onPagar}
                      icono={<Wallet className="size-3.5" aria-hidden />}
                    >
                      Pagar ahora
                    </Boton>
                  )}

                  {pedido.cancelable && (
                    <Boton
                      variante="peligro"
                      tamano="sm"
                      onClick={onCancelar}
                      icono={<XCircle className="size-3.5" aria-hidden />}
                    >
                      Cancelar pedido
                    </Boton>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
