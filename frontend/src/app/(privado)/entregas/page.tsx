'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bike, MapPin, Phone, PowerOff, Zap } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { RequierePermiso } from '@/components/RequierePermiso';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Insignia } from '@/components/ui/Insignia';
import { Boton } from '@/components/ui/Boton';
import { MapaUbicacion } from '@/components/pedidos/MapaUbicacion';
import type { PedidoGestion } from '@/types';
import { ETIQUETA_ESTADO, TONO_ESTADO } from '@/lib/pedidos';
import { formatearBs, tiempoTranscurrido } from '@/lib/formato';
import { cn } from '@/lib/cn';

/**
 * RF-PED-07 — las entregas de quien mira.
 *
 * Existe aparte del tablero general porque el repartidor no necesita ver todos
 * los pedidos del negocio: necesita **los suyos**, con la dirección, el punto
 * en el mapa y el teléfono de quien recibe. Antes tenía que buscarlos entre
 * los de todos.
 *
 * El interruptor de turno está arriba y no escondido en un menú: es lo primero
 * que hace al empezar la jornada, y lo que determina si el sistema lo va a
 * proponer para nuevas entregas.
 */
export default function PaginaEntregas() {
  return (
    <RequierePermiso permiso="PEDIDO_LEER">
      <MisEntregas />
    </RequierePermiso>
  );
}

function MisEntregas() {
  const { notificar } = useNotificaciones();

  const [entregas, setEntregas] = useState<PedidoGestion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [deTurno, setDeTurno] = useState(false);
  const [cambiando, setCambiando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setEntregas(await api.get<PedidoGestion[]>('/gestion/mis-entregas'));
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar sus entregas');
    } finally {
      setCargando(false);
    }
  }, [notificar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cambiarTurno() {
    setCambiando(true);
    try {
      const r = await api.put<{ disponible: boolean }>('/gestion/disponibilidad', {
        disponible: !deTurno,
      });
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
      setCambiando(false);
    }
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Mis entregas"
        descripcion="Los pedidos que tiene asignados, con su dirección y referencia"
      />

      <section
        className={cn(
          'superficie-tarjeta mb-5 flex flex-wrap items-center gap-3 rounded-2xl p-4 transition-colors',
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

        <div className="min-w-0 flex-1">
          <p className="text-sm text-tinta">{deTurno ? 'Está de turno' : 'Fuera de turno'}</p>
          <p className="mt-0.5 text-[11px] text-tinta-tenue">
            {deTurno
              ? 'El sistema puede proponerlo para las entregas nuevas'
              : 'No se le asignarán entregas hasta que active su turno'}
          </p>
        </div>

        <Boton
          variante={deTurno ? 'contorno' : 'primario'}
          cargando={cambiando}
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
            deTurno
              ? 'Cuando le asignen un pedido va a aparecer acá.'
              : 'Inicie su turno para que el sistema pueda asignarle entregas.'
          }
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          <AnimatePresence initial={false}>
            {entregas.map((pedido, indice) => (
              <motion.li
                key={pedido.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25, delay: Math.min(indice * 0.04, 0.25) }}
                className="superficie-tarjeta overflow-hidden rounded-2xl"
              >
                <TarjetaEntrega pedido={pedido} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </>
  );
}

function TarjetaEntrega({ pedido }: { pedido: PedidoGestion }) {
  const { ubicacion, cliente } = pedido;
  const punto =
    ubicacion.latitud !== null && ubicacion.longitud !== null
      ? { lat: ubicacion.latitud, lon: ubicacion.longitud }
      : null;

  return (
    <>
      <header className="flex flex-wrap items-center gap-2 border-b border-borde px-4 py-3">
        <span className="font-mono text-[11px] text-tinta-tenue">
          #{String(pedido.id).padStart(5, '0')}
        </span>
        <Insignia tono={TONO_ESTADO[pedido.estadoPedido]}>
          {ETIQUETA_ESTADO[pedido.estadoPedido]}
        </Insignia>
        <span className="ml-auto text-sm font-semibold tabular-nums text-tinta">
          {formatearBs(pedido.total)}
        </span>
      </header>

      {/* El mapa primero: es lo que el repartidor mira antes de salir. */}
      {punto && <MapaUbicacion valor={punto} altura="h-56 sm:h-64" />}

      <div className="space-y-3 px-4 py-3.5">
        <p className="flex items-start gap-2 text-sm text-tinta-suave">
          <MapPin className="mt-0.5 size-4 shrink-0 text-marca-400" aria-hidden />
          <span>
            {ubicacion.calle}
            {ubicacion.numero ? ` ${ubicacion.numero}` : ''}
            <span className="mt-0.5 block text-[11px] text-tinta-tenue">
              {ubicacion.referencia}
            </span>
          </span>
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-3">
          <span className="min-w-0 text-[11px] text-tinta-tenue">
            {cliente.nombreCompleto} · pedido {tiempoTranscurrido(pedido.fecha)}
          </span>

          {/* Marcar y llamar: lo que hace falta si no encuentra la puerta. */}
          {cliente.telefono && (
            <a
              href={`tel:${cliente.telefono}`}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-borde px-2.5 py-1.5 text-[11px] text-tinta-suave transition-colors hover:border-marca-500/40 hover:text-marca-300"
            >
              <Phone className="size-3.5" aria-hidden />
              {cliente.telefono}
            </a>
          )}
        </div>
      </div>
    </>
  );
}
