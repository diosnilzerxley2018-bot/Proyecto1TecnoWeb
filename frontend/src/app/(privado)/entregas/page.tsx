'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Banknote, Bike, ChefHat, CircleCheck, MapPin, Phone, PowerOff, Zap } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { RequierePermiso } from '@/components/RequierePermiso';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Insignia } from '@/components/ui/Insignia';
import { Boton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/Dialogo';
import { MapaUbicacion } from '@/components/pedidos/MapaUbicacion';
import { usarRefrescoPeriodico } from '@/components/ui/usarRefrescoPeriodico';
import type { Disponibilidad, EstadoPedido, PedidoGestion } from '@/types';
import { CARGO_REPARTIDOR } from '@/lib/dominio';
import { ETIQUETA_ESTADO, TONO_ESTADO, avisoTrasAccion, textoDePago } from '@/lib/pedidos';
import { formatearBs, tiempoTranscurrido } from '@/lib/formato';
import { cn } from '@/lib/cn';

/**
 * RF-PED-07 — las entregas de quien mira.
 *
 * Existe aparte del tablero general porque el repartidor no necesita ver todos
 * los pedidos del negocio: necesita **los suyos**, con la dirección, el punto
 * en el mapa, el teléfono de quien recibe y cuánto tiene que cobrar.
 *
 * Se ordena por su tarea, no por fecha. Primero lo que ya está en la calle,
 * después lo que está por salir y al final, compacto y sin botones, lo que
 * sigue en la cocina. Antes las tres cosas se veían iguales, con el mismo
 * botón verde grande, y a un pedido todavía en cocina se le ofrecía "Poner en
 * preparación", que no es trabajo del repartidor.
 */
export default function PaginaEntregas() {
  return (
    <RequierePermiso permiso="PEDIDO_LEER">
      <MisEntregas />
    </RequierePermiso>
  );
}

type Cierre = { pedido: PedidoGestion; destino: 'Entregado' | 'Cancelado' };

function MisEntregas() {
  const { sesion } = useAuth();
  const { notificar } = useNotificaciones();

  const [entregas, setEntregas] = useState<PedidoGestion[]>([]);
  const [cargando, setCargando] = useState(true);
  /**
   * `null` mientras no se sabe. Antes arrancaba en `false`, y como nunca se
   * leía del servidor, la pantalla decía «Fuera de turno» cada vez que se
   * entraba aunque el turno siguiera abierto en la base.
   */
  const [deTurno, setDeTurno] = useState<boolean | null>(null);
  const [cambiandoTurno, setCambiandoTurno] = useState(false);
  const [enCurso, setEnCurso] = useState<number | null>(null);
  const [porCerrar, setPorCerrar] = useState<Cierre | null>(null);

  /** Un cargo conocido que no es de reparto: esta no es su pantalla. */
  const cargo = sesion?.usuario.cargo;
  const noReparte = cargo !== undefined && cargo !== CARGO_REPARTIDOR;

  const cargarEntregas = useCallback(async () => {
    try {
      setEntregas(await api.get<PedidoGestion[]>('/gestion/mis-entregas'));
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar sus entregas');
    } finally {
      setCargando(false);
    }
  }, [notificar]);

  /**
   * Va aparte de las entregas: si una de las dos consultas falla, la otra
   * igual tiene que verse.
   */
  const cargarTurno = useCallback(async () => {
    try {
      const { disponible } = await api.get<Disponibilidad>('/gestion/disponibilidad');
      setDeTurno(disponible);
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo consultar su turno');
    }
  }, [notificar]);

  useEffect(() => {
    if (noReparte) return;
    void cargarEntregas();
    void cargarTurno();
  }, [cargarEntregas, cargarTurno, noReparte]);

  // Una entrega nueva aparece sola: el repartidor no tiene por qué recargar.
  usarRefrescoPeriodico(cargarEntregas, 20_000, !noReparte);

  const grupos = useMemo(
    () => ({
      enCamino: entregas.filter((p) => p.estadoPedido === 'En camino'),
      porSalir: entregas.filter((p) => p.estadoPedido === 'En preparacion'),
      enCocina: entregas.filter((p) => p.estadoPedido === 'Recibido'),
    }),
    [entregas],
  );

  /**
   * Mueve el pedido y vuelve a leer la lista. Se recarga en vez de retocarla
   * en memoria: un pedido cerrado sale de «mis entregas», y reconstruirlo a
   * mano correría el riesgo de mostrar algo distinto de lo que quedó guardado.
   */
  async function mover(pedido: PedidoGestion, destino: EstadoPedido) {
    setEnCurso(pedido.id);
    try {
      await api.patch<PedidoGestion>(`/gestion/pedidos/${pedido.id}/estado`, { estado: destino });
      notificar('exito', avisoTrasAccion(pedido.id, destino, pedido));
      setPorCerrar(null);
      await cargarEntregas();
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo actualizar la entrega');
    } finally {
      setEnCurso(null);
    }
  }

  async function cambiarTurno() {
    // Sin saber el estado actual no hay a qué invertirlo.
    if (deTurno === null) return;
    setCambiandoTurno(true);
    try {
      const r = await api.put<Disponibilidad>('/gestion/disponibilidad', { disponible: !deTurno });
      setDeTurno(r.disponible);
      notificar(
        'exito',
        r.disponible
          ? 'Está de turno: el sistema puede asignarle entregas'
          : 'Fuera de turno: no se le asignarán entregas nuevas',
      );
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo cambiar su turno');
    } finally {
      setCambiandoTurno(false);
    }
  }

  if (noReparte) {
    return (
      <>
        <EncabezadoPagina titulo="Mis entregas" descripcion="Pedidos asignados a un repartidor" />
        <EstadoVacio
          icono={<Bike className="size-6" aria-hidden />}
          titulo="Esta pantalla es para repartidores"
          descripcion="Los pedidos del local se atienden desde el módulo Pedidos."
        />
      </>
    );
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Mis entregas"
        descripcion="Lo que tiene que llevar, a dónde y cuánto cobrar"
      />

      <section
        className={cn(
          'superficie-tarjeta mb-6 flex flex-wrap items-center gap-3 rounded-2xl p-4 transition-colors',
          deTurno && 'border-marca-500/40 bg-marca-500/[0.06]',
        )}
      >
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl',
            deTurno ? 'bg-marca-500/15 text-marca-300' : 'bg-white/[0.04] text-tinta-tenue',
          )}
        >
          {deTurno ? <Zap className="size-5" aria-hidden /> : <PowerOff className="size-5" aria-hidden />}
        </span>

        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-sm text-tinta">
            {deTurno === null ? 'Consultando su turno…' : deTurno ? 'Está de turno' : 'Fuera de turno'}
          </p>
          <p className="mt-0.5 text-[11px] text-tinta-tenue">
            {deTurno === null
              ? 'Un momento'
              : deTurno
                ? 'Le llegan las entregas nuevas'
                : 'No se le asignarán entregas hasta que active su turno'}
          </p>
        </div>

        {/* Deshabilitado mientras no se sabe el turno: el botón invierte el
            estado actual, y sin conocerlo ofrecería la acción equivocada. */}
        <Boton
          variante={deTurno ? 'secundario' : 'primario'}
          cargando={cambiandoTurno}
          disabled={deTurno === null}
          onClick={cambiarTurno}
          className="shrink-0"
        >
          {deTurno ? 'Terminar turno' : 'Iniciar turno'}
        </Boton>
      </section>

      {cargando ? (
        <EsqueletoFilas filas={3} alto="h-32" />
      ) : entregas.length === 0 ? (
        <EstadoVacio
          icono={<Bike className="size-6" aria-hidden />}
          titulo="Sin entregas asignadas"
          descripcion={
            deTurno === false
              ? 'Inicie su turno para que el sistema pueda asignarle entregas.'
              : 'Cuando le asignen un pedido va a aparecer acá, sin recargar la página.'
          }
        />
      ) : (
        <div className="space-y-8">
          <Grupo titulo="En camino" cantidad={grupos.enCamino.length}>
            {grupos.enCamino.map((pedido) => (
              <TarjetaEntrega key={pedido.id} pedido={pedido}>
                <Boton
                  variante="primario"
                  tamano="lg"
                  className="w-full justify-center"
                  icono={<CircleCheck className="size-4" aria-hidden />}
                  onClick={() => setPorCerrar({ pedido, destino: 'Entregado' })}
                >
                  Registrar entrega
                </Boton>
                {/* La salida del flujo va discreta: es lo que se registra
                    cuando algo salió mal, no la acción esperada. */}
                <button
                  type="button"
                  onClick={() => setPorCerrar({ pedido, destino: 'Cancelado' })}
                  className="w-full rounded-xl py-2 text-xs text-tinta-tenue underline-offset-2 transition-colors hover:text-peligro hover:underline"
                >
                  No pude entregarlo
                </button>
              </TarjetaEntrega>
            ))}
          </Grupo>

          <Grupo
            titulo="Por salir"
            cantidad={grupos.porSalir.length}
            ayuda="La cocina lo está preparando. Márquelo al salir con él."
          >
            {grupos.porSalir.map((pedido) => (
              <TarjetaEntrega key={pedido.id} pedido={pedido}>
                <Boton
                  variante="primario"
                  tamano="lg"
                  className="w-full justify-center"
                  icono={<Bike className="size-4" aria-hidden />}
                  cargando={enCurso === pedido.id}
                  onClick={() => void mover(pedido, 'En camino')}
                >
                  Salgo con el pedido
                </Boton>
              </TarjetaEntrega>
            ))}
          </Grupo>

          <Grupo
            titulo="En cocina"
            cantidad={grupos.enCocina.length}
            ayuda="Asignados a usted, pero la cocina todavía no los empezó."
          >
            {grupos.enCocina.map((pedido) => (
              <FilaEnCocina key={pedido.id} pedido={pedido} />
            ))}
          </Grupo>
        </div>
      )}

      <DialogoCierre
        cierre={porCerrar}
        enviando={porCerrar !== null && enCurso === porCerrar.pedido.id}
        onConfirmar={() => porCerrar && void mover(porCerrar.pedido, porCerrar.destino)}
        onCerrar={() => setPorCerrar(null)}
      />
    </>
  );
}

function Grupo({
  titulo,
  cantidad,
  ayuda,
  children,
}: {
  titulo: string;
  cantidad: number;
  ayuda?: string;
  children: React.ReactNode;
}) {
  if (cantidad === 0) return null;
  return (
    <section>
      <header className="mb-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-tinta">
          {titulo}
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] tabular-nums text-tinta-suave">
            {cantidad}
          </span>
        </h2>
        {ayuda && <p className="mt-0.5 text-[11px] text-tinta-tenue">{ayuda}</p>}
      </header>
      <ul className="grid gap-4 lg:grid-cols-2">
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </ul>
    </section>
  );
}

/** Una entrega que está por salir o en la calle: todo lo que hace falta para llevarla. */
function TarjetaEntrega({ pedido, children }: { pedido: PedidoGestion; children: React.ReactNode }) {
  const { ubicacion, cliente } = pedido;
  const pago = textoDePago(pedido, 'personal');
  const cobra = pedido.metodoPago === 'Efectivo' && pedido.estadoPago !== 'Pagado';
  const punto =
    ubicacion.latitud !== null && ubicacion.longitud !== null
      ? { lat: ubicacion.latitud, lon: ubicacion.longitud }
      : null;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="superficie-tarjeta overflow-hidden rounded-2xl"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-borde px-4 py-3">
        <span className="font-mono text-[11px] text-tinta-tenue">
          #{String(pedido.id).padStart(5, '0')}
        </span>
        <Insignia tono={TONO_ESTADO[pedido.estadoPedido]} punto={pedido.estadoPedido === 'En camino'}>
          {ETIQUETA_ESTADO[pedido.estadoPedido]}
        </Insignia>
        <span className="ml-auto text-[11px] text-tinta-tenue">
          pedido {tiempoTranscurrido(pedido.fecha)}
        </span>
      </header>

      {/* Qué cobrar, antes que nada: es lo que no puede olvidarse en la puerta. */}
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3',
          cobra ? 'bg-aviso/10 text-aviso' : 'bg-marca-500/8 text-marca-300',
        )}
      >
        {cobra ? (
          <Banknote className="size-5 shrink-0" aria-hidden />
        ) : (
          <CircleCheck className="size-5 shrink-0" aria-hidden />
        )}
        <span className="text-sm font-semibold">{pago.texto}</span>
      </div>

      {/* El mapa: lo que el repartidor mira antes de salir. */}
      {punto && <MapaUbicacion valor={punto} altura="h-52 sm:h-60" />}

      <div className="space-y-3 px-4 py-3.5">
        <p className="flex items-start gap-2 text-sm text-tinta">
          <MapPin className="mt-0.5 size-4 shrink-0 text-marca-400" aria-hidden />
          <span>
            {ubicacion.calle}
            {ubicacion.numero ? ` ${ubicacion.numero}` : ''}
            {ubicacion.referencia && (
              <span className="mt-0.5 block text-[12px] text-tinta-suave">{ubicacion.referencia}</span>
            )}
          </span>
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 text-[12px] text-tinta-suave">{cliente.nombreCompleto}</span>
          {/* Llamar: lo que hace falta si no encuentra la puerta. */}
          {cliente.telefono && (
            <a
              href={`tel:${cliente.telefono}`}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-[12px] text-tinta-suave transition-colors hover:border-marca-500/40 hover:text-marca-300"
            >
              <Phone className="size-3.5" aria-hidden />
              Llamar
            </a>
          )}
        </div>

        {/* Lo que lleva, para revisar la bolsa al recogerla. */}
        <p className="text-[12px] leading-relaxed text-tinta-tenue">
          {pedido.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(' · ')}
        </p>

        <div className="space-y-1 border-t border-borde pt-3">{children}</div>
      </div>
    </motion.li>
  );
}

/** Un pedido que todavía está en cocina: se ve, pero no pide nada. */
function FilaEnCocina({ pedido }: { pedido: PedidoGestion }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-3 rounded-2xl border border-borde px-4 py-3"
    >
      <ChefHat className="size-4 shrink-0 text-tinta-tenue" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-tinta-suave">
          {pedido.ubicacion.calle}
          {pedido.ubicacion.numero ? ` ${pedido.ubicacion.numero}` : ''}
        </p>
        <p className="text-[11px] text-tinta-tenue">
          #{String(pedido.id).padStart(5, '0')} · pedido {tiempoTranscurrido(pedido.fecha)}
        </p>
      </div>
      <span className="shrink-0 text-sm tabular-nums text-tinta-suave">{formatearBs(pedido.total)}</span>
    </motion.li>
  );
}

/**
 * Confirmación antes de cerrar una entrega.
 *
 * Las dos salidas son definitivas: una da el pedido por entregado y cobrado,
 * la otra lo cancela y avisa al cliente. Antes bastaba un toque en un botón
 * grande, y un roce con el pulgar no tenía vuelta atrás. La confirmación de
 * entrega en efectivo es además el recordatorio de cobrar.
 */
function DialogoCierre({
  cierre,
  enviando,
  onConfirmar,
  onCerrar,
}: {
  cierre: Cierre | null;
  enviando: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  const pedido = cierre?.pedido;
  const numero = pedido ? `#${String(pedido.id).padStart(5, '0')}` : '';
  const efectivo = pedido?.metodoPago === 'Efectivo' && pedido.estadoPago !== 'Pagado';
  const entregando = cierre?.destino === 'Entregado';

  return (
    <Dialogo
      abierto={cierre !== null}
      onCerrar={onCerrar}
      titulo={entregando ? `¿Entregó el pedido ${numero}?` : `¿No pudo entregar el pedido ${numero}?`}
      ancho="max-w-md"
    >
      {pedido && (
        <>
          <p className="text-sm text-tinta-suave">
            {entregando
              ? efectivo
                ? `Confirme que recibió ${formatearBs(pedido.total)} en efectivo de ${pedido.cliente.nombreCompleto}.`
                : `Ya está pagado con ${pedido.metodoPago === 'QR' ? 'QR' : 'tarjeta'}: no cobre nada.`
              : 'El pedido se cancela y se le avisa al cliente por correo. La comida vuelve al local.'}
          </p>

          {!entregando && pedido.cliente.telefono && (
            <a
              href={`tel:${pedido.cliente.telefono}`}
              className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-borde py-2.5 text-sm text-tinta transition-colors hover:border-marca-500/40"
            >
              <Phone className="size-4" aria-hidden />
              Antes, intente llamar al cliente
            </a>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Boton variante="fantasma" onClick={onCerrar} className="justify-center">
              Volver
            </Boton>
            <Boton
              variante={entregando ? 'primario' : 'peligro'}
              cargando={enviando}
              onClick={onConfirmar}
              className="justify-center"
            >
              {entregando
                ? efectivo
                  ? 'Sí, entregado y cobrado'
                  : 'Sí, entregado'
                : 'Sí, no se pudo entregar'}
            </Boton>
          </div>
        </>
      )}
    </Dialogo>
  );
}
