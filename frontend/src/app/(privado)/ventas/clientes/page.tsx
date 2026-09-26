'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Leaf, Mail, Pencil, Phone, Search, UserRound, Users } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { RequierePermiso } from '@/components/RequierePermiso';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { Estadistica } from '@/components/ui/Estadistica';
import { Paginacion } from '@/components/ui/Paginacion';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Insignia } from '@/components/ui/Insignia';
import { Boton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/Dialogo';
import { Campo, Interruptor } from '@/components/ui/Campo';
import { Tooltip } from '@/components/ui/Tooltip';
import { TextoResaltado } from '@/components/ui/TextoResaltado';
import { useRetardo } from '@/components/ui/usarRetardo';
import { useEnlaceDirecto } from '@/components/ui/usarEnlaceDirecto';
import type { Cliente, Pagina } from '@/types';
import { formatearDia } from '@/lib/formato';

/** CU-VEN-02 — Gestionar Cliente, lado del personal. */
export default function PaginaClientes() {
  return (
    <RequierePermiso permiso="CLIENTE_GESTIONAR">
      <ListadoClientes />
    </RequierePermiso>
  );
}

function ListadoClientes() {
  const { notificar } = useNotificaciones();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Cliente | null>(null);

  /*
   * El listado viene por páginas y **la búsqueda la resuelve el servidor**
   * (H7): buscar dentro de una página dejaría fuera a los clientes de las
   * demás, y una ficha que existe pero no aparece es peor que no buscar.
   *
   * Lo escrito viaja con retardo, cuando se deja de teclear: antes cada letra
   * era una consulta y la lista parpadeaba entre esqueletos. `?buscar=` llega
   * del buscador general con el correo del cliente elegido.
   */
  const enlace = useEnlaceDirecto(['buscar'], ({ buscar }) => {
    if (buscar !== undefined) cambiarBusqueda(buscar);
  });
  const [busqueda, setBusqueda] = useState(enlace.buscar ?? '');
  const termino = useRetardo(busqueda.trim());

  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);

  /**
   * Las cifras cuentan todas las fichas, no las de la búsqueda: «Fichas
   * registradas» decía 1 mientras se buscaba un nombre. Por eso se piden
   * aparte, y solo al abrir y tras una edición.
   */
  const [cifras, setCifras] = useState<{ activos: number; registradas: number } | null>(null);

  /**
   * Número de la última consulta del listado: si «ana» tarda más que
   * «ana gómez», su respuesta no debe pisar a la de la búsqueda completa.
   */
  const ultimaConsulta = useRef(0);

  const cargarListado = useCallback(async () => {
    const consulta = ++ultimaConsulta.current;
    try {
      const parametros = new URLSearchParams({
        incluirInactivos: 'true',
        pagina: String(pagina),
      });
      if (termino !== '') parametros.set('termino', termino);

      const respuesta = await api.get<Pagina<Cliente>>(`/clientes?${parametros}`);
      if (consulta !== ultimaConsulta.current) return;
      setClientes(respuesta.datos);
      setPaginas(respuesta.paginas);
      setTotal(respuesta.total);
    } catch (e) {
      if (consulta !== ultimaConsulta.current) return;
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar los clientes');
    } finally {
      if (consulta === ultimaConsulta.current) setCargando(false);
    }
  }, [notificar, pagina, termino]);

  const cargarCifras = useCallback(async () => {
    try {
      // Solo por sus totales: se pide una ficha, no la lista entera.
      const [soloActivos, todas] = await Promise.all([
        api.get<Pagina<Cliente>>('/clientes?porPagina=1'),
        api.get<Pagina<Cliente>>('/clientes?porPagina=1&incluirInactivos=true'),
      ]);
      setCifras({ activos: soloActivos.total, registradas: todas.total });
    } catch {
      // Sin cifras la pantalla sigue sirviendo: el listado avisa si algo falla.
    }
  }, []);

  useEffect(() => {
    void cargarListado();
  }, [cargarListado]);

  useEffect(() => {
    void cargarCifras();
  }, [cargarCifras]);

  /** Buscar de nuevo empieza por la primera página: la tercera puede no existir. */
  function cambiarBusqueda(texto: string) {
    setBusqueda(texto);
    setPagina(1);
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="Fichas de los clientes del negocio, con sus preferencias alimentarias"
      />

      {/*
        Las dos cifras salen del **total** que informa el servidor, no de
        contar la página: con páginas, contar lo visible diría "20 clientes"
        tenga el negocio veinte o veinte mil.
      */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Estadistica
          indice={0}
          etiqueta="Clientes activos"
          valor={cifras?.activos ?? '—'}
          tono="marca"
          icono={<Users className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={1}
          etiqueta="Fichas registradas"
          valor={cifras?.registradas ?? '—'}
          tono="info"
          icono={<UserRound className="size-5" aria-hidden />}
        />
      </div>

      <div className="relative mb-5 lg:w-80">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
          aria-hidden
        />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => cambiarBusqueda(e.target.value)}
          placeholder="Buscar por nombre o correo"
          aria-label="Buscar clientes"
          className="h-10 w-full rounded-xl border border-borde bg-superficie-alta pl-10 pr-3 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-tenue hover:border-borde-fuerte focus:border-marca-500/60"
        />
      </div>

      {cargando ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <EsqueletoFilas key={i} filas={1} alto="h-40" />
          ))}
        </div>
      ) : clientes.length === 0 ? (
        /* Lo que distingue los dos vacíos es si se está buscando: antes se
           preguntaba por la lista, que en esta rama siempre está vacía, y una
           búsqueda sin resultados decía «No hay clientes registrados». */
        <EstadoVacio
          icono={<Users className="size-6" aria-hidden />}
          titulo={termino === '' ? 'No hay clientes registrados' : 'Sin coincidencias'}
          descripcion={
            termino === ''
              ? 'Los clientes se registran desde el portal web o los da de alta el personal.'
              : `Ningún cliente coincide con «${termino}».`
          }
          accion={
            termino !== '' && (
              <Boton variante="contorno" onClick={() => cambiarBusqueda('')}>
                Limpiar búsqueda
              </Boton>
            )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {clientes.map((cliente, indice) => (
              <TarjetaCliente
                key={cliente.id}
                cliente={cliente}
                indice={indice}
                busqueda={termino}
                onEditar={() => setEditando(cliente)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <Paginacion
        pagina={pagina}
        paginas={paginas}
        total={total}
        nombre="clientes"
        onCambiar={setPagina}
      />

      <Dialogo
        abierto={editando !== null}
        onCerrar={() => setEditando(null)}
        titulo={`Editar ${editando?.nombreCompleto ?? ''}`}
      >
        {editando && (
          <FormularioCliente
            cliente={editando}
            onCancelar={() => setEditando(null)}
            onListo={() => {
              setEditando(null);
              void cargarListado();
              void cargarCifras();
            }}
          />
        )}
      </Dialogo>
    </>
  );
}

function TarjetaCliente({
  cliente,
  indice,
  busqueda,
  onEditar,
}: {
  cliente: Cliente;
  indice: number;
  /** Lo buscado, para resaltarlo en el nombre y el correo. */
  busqueda: string;
  onEditar: () => void;
}) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, delay: Math.min(indice * 0.04, 0.3), ease: 'easeOut' }}
      className={`superficie-tarjeta group rounded-2xl p-4 ${cliente.activo ? '' : 'opacity-55'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-borde bg-superficie-suave text-xs font-semibold text-marca-300">
            {cliente.nombre[0]}
            {cliente.apellido[0]}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-tinta">
              <TextoResaltado texto={cliente.nombreCompleto} busqueda={busqueda} />
            </p>
            <p className="mt-0.5 truncate text-[11px] text-tinta-tenue">
              @{cliente.nombreUsuario}
            </p>
          </div>
        </div>

        <Tooltip texto="Editar ficha">
          <Boton
            tamano="icono"
            variante="fantasma"
            onClick={onEditar}
            aria-label="Editar cliente"
            className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          >
            <Pencil className="size-4" aria-hidden />
          </Boton>
        </Tooltip>
      </div>

      <div className="mt-3.5 space-y-1.5 text-xs text-tinta-suave">
        <p className="flex items-center gap-2">
          <Mail className="size-3.5 shrink-0 text-tinta-tenue" aria-hidden />
          <span className="truncate">
            <TextoResaltado texto={cliente.email} busqueda={busqueda} />
          </span>
        </p>
        <p className="flex items-center gap-2">
          <Phone className="size-3.5 shrink-0 text-tinta-tenue" aria-hidden />
          <span>{cliente.telefono ?? 'Sin teléfono'}</span>
        </p>
      </div>

      {(cliente.preferenciaAlimentaria || cliente.restriccionDietetica) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {cliente.preferenciaAlimentaria && (
            <Insignia tono="marca">{cliente.preferenciaAlimentaria}</Insignia>
          )}
          {cliente.restriccionDietetica && (
            <Insignia tono="aviso">{cliente.restriccionDietetica}</Insignia>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-borde pt-3 text-[11px] text-tinta-tenue">
        <span>Desde {formatearDia(cliente.fechaRegistro)}</span>
        <span className="tabular-nums">
          {cliente.cantidadPedidos} pedidos · {cliente.cantidadVentas} compras
        </span>
      </div>
    </motion.article>
  );
}

function FormularioCliente({
  cliente,
  onListo,
  onCancelar,
}: {
  cliente: Cliente;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const { notificar } = useNotificaciones();

  const [nombre, setNombre] = useState(cliente.nombre);
  const [apellido, setApellido] = useState(cliente.apellido);
  const [email, setEmail] = useState(cliente.email);
  const [telefono, setTelefono] = useState(cliente.telefono ?? '');
  const [preferencia, setPreferencia] = useState(cliente.preferenciaAlimentaria ?? '');
  const [restriccion, setRestriccion] = useState(cliente.restriccionDietetica ?? '');
  const [activo, setActivo] = useState(cliente.activo);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      await api.put(`/clientes/${cliente.id}`, {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim(),
        telefono: telefono.trim() || null,
        preferenciaAlimentaria: preferencia.trim() || null,
        restriccionDietetica: restriccion.trim() || null,
        activo,
      });
      notificar('exito', 'Ficha actualizada');
      onListo();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar la ficha');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre"
          required
          maxLength={100}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Campo
          etiqueta="Apellido"
          required
          maxLength={100}
          value={apellido}
          onChange={(e) => setApellido(e.target.value)}
        />
      </div>

      <Campo
        etiqueta="Correo electrónico"
        type="email"
        required
        maxLength={150}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        ayuda="No puede coincidir con el de otra cuenta"
      />

      <Campo
        etiqueta="Teléfono"
        maxLength={20}
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Preferencia alimentaria"
          maxLength={100}
          value={preferencia}
          onChange={(e) => setPreferencia(e.target.value)}
        />
        <Campo
          etiqueta="Restricción dietética"
          maxLength={100}
          value={restriccion}
          onChange={(e) => setRestriccion(e.target.value)}
        />
      </div>

      <Interruptor
        activo={activo}
        onCambiar={setActivo}
        etiqueta="Cuenta activa"
        descripcion="La baja es lógica: la ficha y su historial de pedidos y ventas se conservan"
      />

      {error && (
        <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Boton type="button" variante="fantasma" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" variante="primario" cargando={enviando}>
          Guardar cambios
        </Boton>
      </div>
    </form>
  );
}
