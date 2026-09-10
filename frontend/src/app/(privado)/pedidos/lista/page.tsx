'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Bike,
  ClipboardList,
  CookingPot,
  Inbox,
  PackageCheck,
  RefreshCw,
  Search,
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
import { Boton } from '@/components/ui/Boton';
import { TarjetaPedido } from '@/components/pedidos/TarjetaPedido';
import { PanelPedido } from '@/components/pedidos/PanelPedido';
import type {
  CandidatoRepartidor,
  EstadoPedido,
  Pagina,
  PedidoGestion,
  Repartidor,
} from '@/types';
import { ETIQUETA_ESTADO, ORDEN_FLUJO } from '@/lib/pedidos';

/** CU-PED-02 — Gestionar Pedido, lado del empleado (Etapa 1). */
export default function PaginaPedidos() {
  return (
    <RequierePermiso permiso="PEDIDO_LEER">
      <TableroPedidos />
    </RequierePermiso>
  );
}

type Filtro = EstadoPedido | 'Todos';

function TableroPedidos() {
  const { notificar } = useNotificaciones();

  const [pedidos, setPedidos] = useState<PedidoGestion[]>([]);
  const [repartidores, setRepartidores] = useState<CandidatoRepartidor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('Todos');
  const [busqueda, setBusqueda] = useState('');
  const [idAbierto, setIdAbierto] = useState<number | null>(null);

  /*
   * El listado viene por páginas y el filtro por estado lo aplica el servidor
   * (H7): filtrar una página dejaría fuera los pedidos de las demás.
   *
   * Los recuentos del tablero se piden **aparte**, porque cuentan todos los
   * pedidos y no los de la página visible. Son dos preguntas distintas —"¿cómo
   * está el día?" y "¿qué pedidos veo ahora?"— y contar la página respondería
   * mal la primera.
   */
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [conteos, setConteos] = useState<Record<string, number>>({});

  const cargar = useCallback(
    async (silencioso = false) => {
      if (silencioso) setRefrescando(true);
      try {
        const parametros = new URLSearchParams({ pagina: String(pagina) });
        if (filtro !== 'Todos') parametros.set('estado', filtro);

        const [respuesta, listaRepartidores, resumen] = await Promise.all([
          api.get<Pagina<PedidoGestion>>(`/gestion/pedidos?${parametros}`),
          api.get<CandidatoRepartidor[]>('/gestion/repartidores'),
          api.get<Record<string, number>>('/gestion/pedidos/resumen'),
        ]);

        setPedidos(respuesta.datos);
        setPaginas(respuesta.paginas);
        setTotal(respuesta.total);
        setRepartidores(listaRepartidores);
        setConteos(resumen);
      } catch (e) {
        notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar los pedidos');
      } finally {
        setCargando(false);
        setRefrescando(false);
      }
    },
    [notificar, pagina, filtro],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Todos los pedidos del sistema, para el chip «Todos». */
  const totalDeTodos = useMemo(
    () => Object.values(conteos).reduce((suma, n) => suma + n, 0),
    [conteos],
  );

  /**
   * La búsqueda por texto sigue siendo del lado del cliente, y afina **dentro
   * de la página**. Llevarla al servidor pediría un índice de texto sobre tres
   * campos de tablas distintas; mientras tanto, el estado —que es como el
   * personal filtra de verdad— sí lo aplica el servidor.
   */
  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (termino === '') return pedidos;

    return pedidos.filter(
      (pedido) =>
        pedido.cliente.nombreCompleto.toLowerCase().includes(termino) ||
        String(pedido.id).includes(termino) ||
        pedido.ubicacion.calle.toLowerCase().includes(termino),
    );
  }, [pedidos, busqueda]);

  /** Cambiar de filtro vuelve a la primera página: la cuarta puede no existir. */
  function cambiarFiltro(nuevo: Filtro) {
    setFiltro(nuevo);
    setPagina(1);
  }

  const abierto = pedidos.find((p) => p.id === idAbierto) ?? null;

  /** Refresca la lista tras una operación y mantiene el panel sincronizado. */
  async function operar(accion: () => Promise<PedidoGestion>, exito: string) {
    try {
      const actualizado = await accion();
      setPedidos((actuales) =>
        actuales.map((p) => (p.id === actualizado.id ? actualizado : p)),
      );
      notificar('exito', exito);
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo completar la operación');
    }
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Pedidos"
        descripcion="Atienda los pedidos a domicilio y siga su entrega hasta el cliente"
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

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Estadistica
          indice={0}
          etiqueta="Recibidos"
          valor={conteos['Recibido'] ?? 0}
          tono="info"
          icono={<Inbox className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={1}
          etiqueta="En preparación"
          valor={conteos['En preparacion'] ?? 0}
          tono="aviso"
          icono={<CookingPot className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={2}
          etiqueta="En camino"
          valor={conteos['En camino'] ?? 0}
          tono="violeta"
          icono={<Bike className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={3}
          etiqueta="Entregados"
          valor={conteos['Entregado'] ?? 0}
          tono="marca"
          icono={<PackageCheck className="size-5" aria-hidden />}
        />
      </div>

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ChipsFiltro
          idGrupo="filtro-pedidos"
          valor={filtro}
          onCambiar={cambiarFiltro}
          opciones={[
            { valor: 'Todos' as Filtro, etiqueta: 'Todos', cantidad: totalDeTodos },
            ...[...ORDEN_FLUJO, 'Cancelado' as EstadoPedido].map((estado) => ({
              valor: estado as Filtro,
              etiqueta: ETIQUETA_ESTADO[estado],
              cantidad: conteos[estado],
            })),
          ]}
        />

        <div className="relative lg:w-72">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
            aria-hidden
          />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, número o calle"
            aria-label="Buscar pedidos"
            className="h-10 w-full rounded-xl border border-borde bg-superficie-alta pl-10 pr-3 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-tenue hover:border-borde-fuerte focus:border-marca-500/60"
          />
        </div>
      </div>

      {cargando ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <EsqueletoFilas key={i} filas={1} alto="h-44" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <EstadoVacio
          icono={<ClipboardList className="size-6" aria-hidden />}
          titulo={pedidos.length === 0 ? 'Todavía no hay pedidos' : 'Sin coincidencias'}
          descripcion={
            pedidos.length === 0
              ? 'Cuando un cliente confirme un pedido desde el portal, aparecerá aquí para que el personal lo atienda.'
              : 'Ningún pedido coincide con el filtro y la búsqueda actuales.'
          }
          accion={
            (pedidos.length > 0 || busqueda !== '') && (
              <Boton
                variante="contorno"
                onClick={() => {
                  setFiltro('Todos');
                  setBusqueda('');
                }}
              >
                Limpiar filtros
              </Boton>
            )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visibles.map((pedido, indice) => (
              <TarjetaPedido
                key={pedido.id}
                pedido={pedido}
                indice={indice}
                onAbrir={() => setIdAbierto(pedido.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <PanelPedido
        pedido={abierto}
        repartidores={repartidores}
        onCerrar={() => setIdAbierto(null)}
        onAvanzar={(estado) =>
          operar(
            () =>
              api.patch<PedidoGestion>(`/gestion/pedidos/${abierto!.id}/estado`, { estado }),
            `Pedido actualizado a ${ETIQUETA_ESTADO[estado].toLowerCase()}`,
          )
        }
        onAsignar={(idRepartidor) =>
          operar(
            () =>
              api.put<PedidoGestion>(`/gestion/pedidos/${abierto!.id}/repartidor`, {
                idRepartidor,
              }),
            'Repartidor asignado',
          )
        }
      />
    </>
  );
}
