'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Bike, ExternalLink, MapPin, Phone, User } from 'lucide-react';
import { PanelLateral } from '@/components/ui/Dialogo';
import { Boton } from '@/components/ui/Boton';
import { Insignia } from '@/components/ui/Insignia';
import { Selector } from '@/components/ui/Selector';
import { LineaDeTiempo } from './LineaDeTiempo';
import { MapaUbicacion } from './MapaUbicacion';
import { SeguimientoEnVivo } from './SeguimientoEnVivo';
import type { Coordenadas } from '@/lib/dominio';
import type { CandidatoRepartidor, EstadoPedido, PedidoGestion } from '@/types';
import { SugerenciaReparto } from './SugerenciaReparto';
import { useAuth } from '@/context/AuthContext';
import {
  ACCION_HACIA,
  ETIQUETA_ESTADO,
  formatearBs,
  formatearFecha,
  separarTransiciones,
  textoDePago,
} from '@/lib/pedidos';

/**
 * Detalle y operación de un pedido.
 *
 * Las acciones disponibles no se calculan aquí: se dibujan a partir de
 * `transicionesPosibles`, que decide el servidor. Así la interfaz nunca ofrece
 * un botón que la API vaya a rechazar.
 */
/** Las dos salidas de «En camino»: entregarlo, o darlo por no entregado. */
const esCierre = (estado: EstadoPedido | null): boolean =>
  estado === 'Entregado' || estado === 'Cancelado';

export function PanelPedido({
  pedido,
  repartidores,
  onCerrar,
  onAvanzar,
  onAsignar,
}: {
  pedido: PedidoGestion | null;
  repartidores: CandidatoRepartidor[];
  onCerrar: () => void;
  onAvanzar: (estado: EstadoPedido) => Promise<void>;
  onAsignar: (idRepartidor: number) => Promise<void>;
}) {
  const { sesion, tienePermiso } = useAuth();
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [elegido, setElegido] = useState<number | null>(null);
  /** Con repartidor ya asignado, el selector se abre solo si se pide cambiarlo. */
  const [cambiandoRepartidor, setCambiandoRepartidor] = useState(false);

  useEffect(() => {
    setElegido(pedido?.repartidor?.id ?? null);
    setCambiandoRepartidor(false);
  }, [pedido?.id, pedido?.repartidor?.id]);

  if (!pedido) return null;

  const { avance: siguiente, salidas } = separarTransiciones(pedido.transicionesPosibles);
  const pago = textoDePago(pedido, 'personal');
  const necesitaRepartidor = siguiente === 'En camino' && !pedido.repartidor;

  /**
   * CU-PED-02: cerrar la entrega es del repartidor asignado.
   *
   * Se comprueba también acá para no ofrecer un botón que el servidor va a
   * rechazar. **No es la seguridad**: la regla la aplica `avanzarEstado`; esto
   * solo evita el 403 evitable.
   */
  const puedeCerrar =
    pedido.repartidor?.id === sesion?.usuario.id || tienePermiso('PEDIDO_CERRAR_AJENO');
  const cierreBloqueado = esCierre(siguiente) && !puedeCerrar;
  const puedeAsignar = pedido.estadoPedido !== 'Entregado' && pedido.estadoPedido !== 'Cancelado';

  async function ejecutar(clave: string, accion: () => Promise<void>) {
    setEnCurso(clave);
    try {
      await accion();
    } finally {
      setEnCurso(null);
    }
  }

  const puntoEntrega: Coordenadas | null =
    pedido.ubicacion.latitud !== null && pedido.ubicacion.longitud !== null
      ? { lat: pedido.ubicacion.latitud, lon: pedido.ubicacion.longitud }
      : null;

  /** El enlace externo abre la navegación paso a paso del teléfono. */
  const coordenadas = puntoEntrega ? `${puntoEntrega.lat},${puntoEntrega.lon}` : null;

  return (
    <PanelLateral
      abierto
      onCerrar={onCerrar}
      titulo={`Pedido #${String(pedido.id).padStart(5, '0')}`}
      descripcion={formatearFecha(pedido.fecha)}
      pie={
        siguiente || salidas.length > 0 ? (
          <div className="space-y-2">
            {necesitaRepartidor && (
              <p className="text-xs text-aviso">
                Asigne un repartidor antes de marcar el pedido en camino.
              </p>
            )}
            {!puedeCerrar && (siguiente || salidas.length > 0) && esCierre(siguiente ?? salidas[0]) && (
              <p className="text-xs text-aviso">
                Esta entrega la cierra {pedido.repartidor?.nombreCompleto ?? 'su repartidor'}, que
                es quien está en la puerta.
              </p>
            )}
            {siguiente && (
              <Boton
                variante="primario"
                tamano="lg"
                className="w-full justify-center"
                cargando={enCurso === 'estado'}
                disabled={necesitaRepartidor || cierreBloqueado}
                onClick={() => ejecutar('estado', () => onAvanzar(siguiente))}
              >
                {ACCION_HACIA[siguiente] ?? `Pasar a ${ETIQUETA_ESTADO[siguiente]}`}
                <ArrowRight className="size-4" aria-hidden />
              </Boton>
            )}

            {/* La salida del flujo va discreta: es el desenlace que se registra
                cuando la entrega no se pudo hacer, no una acción habitual. */}
            {salidas.map((salida) => (
              <Boton
                key={salida}
                variante="peligro"
                className="w-full justify-center"
                cargando={enCurso === `estado-${salida}`}
                disabled={!puedeCerrar}
                onClick={() => ejecutar(`estado-${salida}`, () => onAvanzar(salida))}
              >
                {ACCION_HACIA[salida] ?? `Pasar a ${ETIQUETA_ESTADO[salida]}`}
              </Boton>
            ))}
          </div>
        ) : (
          <p className="text-center text-xs text-tinta-tenue">
            El pedido está {ETIQUETA_ESTADO[pedido.estadoPedido].toLowerCase()} y no admite más
            cambios.
          </p>
        )
      }
    >
      {/*
        Orden por tarea: primero qué se pidió —es lo que la cocina prepara—,
        después a quién y a dónde, y al final quién lo lleva. Antes lo que había
        que cocinar quedaba al fondo, debajo del bloque de reparto.
      */}
      <div className="space-y-7">
        <section>
          <Titulo>Seguimiento</Titulo>
          <LineaDeTiempo pedido={pedido} para="personal" />
        </section>

        <section>
          <Titulo>Qué se pidió</Titulo>
          <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde">
            {pedido.items.map((item) => (
              <li
                key={item.idProducto}
                className="flex items-center justify-between gap-3 bg-superficie-alta/40 px-3.5 py-3"
              >
                <p className="min-w-0 truncate text-sm text-tinta">
                  <span className="tabular-nums text-tinta-tenue">{item.cantidad}×</span> {item.nombre}
                </p>
                <span className="shrink-0 text-sm tabular-nums text-tinta-suave">
                  {formatearBs(item.subtotal)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-marca-500/8 px-3.5 py-3">
            <Insignia tono={pago.tono}>{pago.texto}</Insignia>
            <span className="text-lg font-semibold tabular-nums text-marca-300">
              {formatearBs(pedido.total)}
            </span>
          </div>
          {pedido.referenciaPago && (
            <p className="mt-2 text-[11px] text-tinta-tenue">Ref. de pago {pedido.referenciaPago}</p>
          )}
        </section>

        <section className="grid gap-2.5">
          <Titulo>Cliente y entrega</Titulo>
          <Dato icono={<User className="size-4" aria-hidden />} texto={pedido.cliente.nombreCompleto} />
          {pedido.cliente.telefono && (
            <Dato
              icono={<Phone className="size-4" aria-hidden />}
              texto={pedido.cliente.telefono}
              enlace={`tel:${pedido.cliente.telefono}`}
            />
          )}
          <Dato
            icono={<MapPin className="size-4" aria-hidden />}
            texto={[
              pedido.ubicacion.calle,
              pedido.ubicacion.numero,
              pedido.ubicacion.referencia,
            ]
              .filter(Boolean)
              .join(' · ')}
            enlace={coordenadas ? `https://www.google.com/maps?q=${coordenadas}` : undefined}
          />

          {/* En camino, el mapa sigue al repartidor. Antes de salir, solo
              aparece si el cliente marcó el punto: un mapa centrado en la
              ciudad no dice nada y ocuparía media pantalla. */}
          {pedido.estadoPedido === 'En camino' ? (
            <SeguimientoEnVivo
              ruta={`/gestion/pedidos/${pedido.id}/seguimiento`}
              destino={puntoEntrega}
              para="personal"
            />
          ) : (
            puntoEntrega && (
              <MapaUbicacion valor={puntoEntrega} altura="h-64 sm:h-72" className="mt-1" />
            )
          )}
        </section>

        {puedeAsignar && (
          <section>
            <Titulo>Repartidor</Titulo>

            {/*
              Con el reparto automático casi todos los pedidos llegan ya
              asignados. Antes el panel mostraba igual la sugerencia con su
              botón "Asignar", el selector y, al final, "Asignado a…": tres
              bloques para decir lo mismo, que invitaban a pensar que faltaba
              asignarlo. Ahora se dice en una línea, y cambiarlo es una acción
              explícita.
            */}
            {pedido.repartidor && !cambiandoRepartidor ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-borde px-3.5 py-3">
                <span className="flex min-w-0 items-center gap-2 text-sm text-tinta">
                  <Bike className="size-4 shrink-0 text-marca-400" aria-hidden />
                  <span className="truncate">{pedido.repartidor.nombreCompleto}</span>
                </span>
                <Boton variante="fantasma" tamano="sm" onClick={() => setCambiandoRepartidor(true)}>
                  Cambiar
                </Boton>
              </div>
            ) : (
              <>
                {!pedido.repartidor && (
                  // RF-PED-07: el sistema propone al de turno con menos entregas.
                  <SugerenciaReparto
                    idPedido={pedido.id}
                    onAceptar={(id) => {
                      setElegido(id);
                      return ejecutar('repartidor', () => onAsignar(id));
                    }}
                  />
                )}

                <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-end">
                  <Selector
                    etiqueta={pedido.repartidor ? 'Nuevo repartidor' : 'O elija a otro'}
                    className="flex-1"
                    valor={elegido}
                    marcador={repartidores.length ? 'Sin asignar' : 'No hay repartidores'}
                    deshabilitado={repartidores.length === 0}
                    opciones={repartidores.map((r) => ({
                      valor: r.id,
                      etiqueta: r.nombreCompleto,
                      // La carga y el turno se ven al elegir: es lo que permite
                      // apartarse de la sugerencia con criterio.
                      descripcion: `${r.entregasEnCurso} en curso · ${r.disponible ? 'de turno' : 'de franco'}`,
                    }))}
                    onCambiar={setElegido}
                  />
                  <Boton
                    variante="contorno"
                    className="h-12 shrink-0"
                    icono={<Bike className="size-4" aria-hidden />}
                    cargando={enCurso === 'repartidor'}
                    disabled={elegido === null || elegido === pedido.repartidor?.id}
                    onClick={() =>
                      elegido !== null &&
                      ejecutar('repartidor', async () => {
                        await onAsignar(elegido);
                        setCambiandoRepartidor(false);
                      })
                    }
                  >
                    Asignar
                  </Boton>
                </div>
                {pedido.repartidor && (
                  <button
                    type="button"
                    onClick={() => setCambiandoRepartidor(false)}
                    className="mt-2 text-xs text-tinta-tenue hover:text-tinta"
                  >
                    Mantener a {pedido.repartidor.nombreCompleto}
                  </button>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </PanelLateral>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
      {children}
    </h3>
  );
}

function Dato({
  icono,
  texto,
  enlace,
}: {
  icono: React.ReactNode;
  texto: string;
  enlace?: string;
}) {
  const contenido = (
    <>
      <span className="mt-0.5 shrink-0 text-tinta-tenue">{icono}</span>
      <span className="min-w-0 flex-1 text-sm text-tinta-suave">{texto}</span>
      {enlace && <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-tinta-tenue" aria-hidden />}
    </>
  );

  if (!enlace) {
    return <div className="flex items-start gap-2.5">{contenido}</div>;
  }

  return (
    <a
      href={enlace}
      target="_blank"
      rel="noreferrer"
      className="flex items-start gap-2.5 rounded-lg transition-colors hover:text-tinta"
    >
      {contenido}
    </a>
  );
}
