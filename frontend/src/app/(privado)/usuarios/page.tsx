'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, Search, UserPlus, Users, UserX } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { Modal } from '@/components/Modal';
import { FormularioUsuario } from '@/components/FormularioUsuario';
import { PanelPermisos } from '@/components/PanelPermisos';
import { TablaUsuarios } from '@/components/TablaUsuarios';
import { RequierePermiso } from '@/components/RequierePermiso';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { Estadistica } from '@/components/ui/Estadistica';
import { ChipsFiltro } from '@/components/ui/ChipsFiltro';
import { Selector } from '@/components/ui/Selector';
import { Boton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/Dialogo';
import { Paginacion } from '@/components/ui/Paginacion';
import { useRetardo } from '@/components/ui/usarRetardo';
import { useEnlaceDirecto } from '@/components/ui/usarEnlaceDirecto';
import type { Pagina, ResumenUsuarios, Rol, UsuarioDetalle, UsuarioLista } from '@/types';

/**
 * Subsistema Administración y Seguridad.
 * Orquesta CU-SEG-02 (gestionar usuario), CU-SEG-04 (asignar permisos)
 * y el desbloqueo derivado de CU-SEG-05.
 */

type Dialogo =
  | { tipo: 'ninguno' }
  | { tipo: 'crear' }
  | { tipo: 'editar'; usuario: UsuarioDetalle }
  | { tipo: 'permisos'; usuario: UsuarioLista };

type FiltroEstado = 'todos' | 'activos' | 'bloqueados' | 'bajas';

/** «Todos los roles» en el selector: los identificadores reales son positivos. */
const TODOS_LOS_ROLES = 0;

export default function PaginaUsuarios() {
  return (
    <RequierePermiso permiso="USUARIO_LEER">
      <ContenidoUsuarios />
    </RequierePermiso>
  );
}

function ContenidoUsuarios() {
  const { sesion, tienePermiso } = useAuth();
  const { notificar } = useNotificaciones();

  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [resumen, setResumen] = useState<ResumenUsuarios | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>({ tipo: 'ninguno' });
  const [aDarDeBaja, setADarDeBaja] = useState<UsuarioLista | null>(null);
  const [dandoDeBaja, setDandoDeBaja] = useState(false);

  const mostrarError = (e: unknown, respaldo: string) =>
    setError(e instanceof ErrorApi ? e.message : respaldo);

  /*
   * Búsqueda y filtros los resuelve el servidor (H7): el listado viene por
   * páginas, y buscar en la página visible dejaría fuera a quien está en la
   * siguiente. Lo escrito viaja con retardo, cuando se deja de teclear.
   *
   * `?buscar=` llega del buscador general con el nombre de usuario elegido.
   * Suelta los demás filtros: la cuenta buscada puede no ser del rol ni del
   * estado que estaban elegidos.
   */
  const enlace = useEnlaceDirecto(['buscar'], ({ buscar }) => {
    if (buscar === undefined) return;
    filtrar(() => {
      setBusqueda(buscar);
      setIdRol(TODOS_LOS_ROLES);
      setEstado('todos');
    });
  });
  const [busqueda, setBusqueda] = useState(enlace.buscar ?? '');
  const termino = useRetardo(busqueda.trim());
  const [idRol, setIdRol] = useState(TODOS_LOS_ROLES);
  const [estado, setEstado] = useState<FiltroEstado>('todos');

  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);

  /**
   * Número de la última consulta del listado. Dos búsquedas pueden cruzarse
   * —la de «cam» tarda más que la de «camila»— y la respuesta vieja no debe
   * pisar a la nueva.
   */
  const ultimaConsulta = useRef(0);

  const cargarListado = useCallback(async () => {
    const consulta = ++ultimaConsulta.current;
    setError(null);
    try {
      const parametros = new URLSearchParams({ pagina: String(pagina) });
      if (termino !== '') parametros.set('termino', termino);
      if (idRol !== TODOS_LOS_ROLES) parametros.set('idRol', String(idRol));
      if (estado !== 'todos') parametros.set('estado', estado);

      const respuesta = await api.get<Pagina<UsuarioLista>>(`/usuarios?${parametros}`);
      if (consulta !== ultimaConsulta.current) return;
      setUsuarios(respuesta.datos);
      setPaginas(respuesta.paginas);
      setTotal(respuesta.total);
    } catch (e) {
      if (consulta === ultimaConsulta.current) mostrarError(e, 'No se pudo cargar el listado');
    } finally {
      if (consulta === ultimaConsulta.current) setCargando(false);
    }
  }, [pagina, termino, idRol, estado]);

  /** Cifras y roles no dependen de los filtros: no se piden en cada búsqueda. */
  const cargarContexto = useCallback(async () => {
    try {
      const [cifras, listaRoles] = await Promise.all([
        api.get<ResumenUsuarios>('/usuarios/resumen'),
        api.get<Rol[]>('/roles'),
      ]);
      setResumen(cifras);
      setRoles(listaRoles);
    } catch (e) {
      mostrarError(e, 'No se pudieron cargar los datos');
    }
  }, []);

  useEffect(() => {
    void cargarListado();
  }, [cargarListado]);

  useEffect(() => {
    void cargarContexto();
  }, [cargarContexto]);

  const refrescar = () => Promise.all([cargarListado(), cargarContexto()]);

  /** Cambiar un filtro vuelve a la primera página: la tercera puede no existir. */
  function filtrar(aplicar: () => void) {
    aplicar();
    setPagina(1);
  }

  const hayFiltros = busqueda.trim() !== '' || idRol !== TODOS_LOS_ROLES || estado !== 'todos';

  function limpiarFiltros() {
    filtrar(() => {
      setBusqueda('');
      setIdRol(TODOS_LOS_ROLES);
      setEstado('todos');
    });
  }

  /**
   * Ejecuta una operación, avisa del resultado y refresca el listado.
   *
   * El aviso no es adorno: dar de baja o desbloquear no cambian nada visible
   * en la fila más que un estado, y sin confirmación no hay forma de saber si
   * la acción llegó al servidor o se perdió por el camino.
   */
  async function ejecutar(
    operacion: () => Promise<unknown>,
    mensajeError: string,
    mensajeExito: string,
  ) {
    try {
      await operacion();
      await refrescar();
      notificar('exito', mensajeExito);
    } catch (e) {
      mostrarError(e, mensajeError);
      notificar('error', e instanceof ErrorApi ? e.message : mensajeError);
    }
  }

  async function abrirEdicion(id: number) {
    try {
      const usuario = await api.get<UsuarioDetalle>(`/usuarios/${id}`);
      setDialogo({ tipo: 'editar', usuario });
    } catch (e) {
      mostrarError(e, 'No se pudo cargar el usuario');
    }
  }

  async function darDeBaja() {
    if (!aDarDeBaja) return;
    setDandoDeBaja(true);
    await ejecutar(
      () => api.del(`/usuarios/${aDarDeBaja.id}`),
      'No se pudo dar de baja',
      `${aDarDeBaja.nombreCompleto} quedó dado de baja`,
    );
    setDandoDeBaja(false);
    setADarDeBaja(null);
  }

  const cerrarDialogo = () => setDialogo({ tipo: 'ninguno' });

  /** Cada diálogo dice qué consiguió: «guardado» a secas no distingue qué. */
  const alGuardar = (mensaje: string) => {
    cerrarDialogo();
    void refrescar();
    notificar('exito', mensaje);
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Administración y Seguridad"
        descripcion="Usuarios, roles y permisos del sistema"
        acciones={
          tienePermiso('USUARIO_CREAR') && (
            <Boton
              variante="primario"
              icono={<UserPlus className="size-4" aria-hidden />}
              onClick={() => setDialogo({ tipo: 'crear' })}
            >
              Nuevo usuario
            </Boton>
          )
        }
      />

      {/*
        Las cifras cuentan **todas** las cuentas, no la página ni la búsqueda:
        las pide aparte el resumen. Los tres estados no se superponen —una
        cuenta dada de baja no cuenta además como bloqueada—, así que suman
        el total.
      */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Estadistica
          indice={0}
          etiqueta="Cuentas activas"
          valor={resumen?.activos ?? '—'}
          tono="marca"
          icono={<Users className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={1}
          etiqueta="Bloqueadas"
          valor={resumen?.bloqueados ?? '—'}
          tono={resumen && resumen.bloqueados > 0 ? 'aviso' : 'neutro'}
          icono={<Lock className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={2}
          etiqueta="Dadas de baja"
          valor={resumen?.bajas ?? '—'}
          tono="neutro"
          icono={<UserX className="size-5" aria-hidden />}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <ChipsFiltro<FiltroEstado>
          idGrupo="filtro-usuarios"
          valor={estado}
          onCambiar={(valor) => filtrar(() => setEstado(valor))}
          opciones={[
            { valor: 'todos', etiqueta: 'Todos', cantidad: resumen?.total },
            { valor: 'activos', etiqueta: 'Activos', cantidad: resumen?.activos },
            { valor: 'bloqueados', etiqueta: 'Bloqueados', cantidad: resumen?.bloqueados },
            { valor: 'bajas', etiqueta: 'De baja', cantidad: resumen?.bajas },
          ]}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Selector<number>
            etiqueta="Rol"
            className="sm:w-52"
            valor={idRol}
            onCambiar={(valor) => filtrar(() => setIdRol(valor))}
            opciones={[
              { valor: TODOS_LOS_ROLES, etiqueta: 'Todos los roles' },
              ...roles.map((r) => ({
                valor: r.id,
                etiqueta: r.nombre,
                descripcion: `${r.cantidadUsuarios} usuario(s)`,
              })),
            ]}
          />

          <div className="relative sm:w-72">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
              aria-hidden
            />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => filtrar(() => setBusqueda(e.target.value))}
              placeholder="Nombre, usuario o correo"
              aria-label="Buscar usuarios"
              className="h-12 w-full rounded-xl border border-borde bg-superficie-alta pl-10 pr-3 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-tenue hover:border-borde-fuerte focus:border-marca-500/60"
            />
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-peligro/10 px-4 py-3 text-sm text-peligro ring-1 ring-peligro/25"
        >
          {error}
        </p>
      )}

      <TablaUsuarios
        usuarios={usuarios}
        cargando={cargando}
        idPropio={sesion?.usuario.id}
        busqueda={termino}
        vacio={
          hayFiltros ? (
            <span className="flex flex-col items-center gap-3">
              Ningún usuario coincide con la búsqueda y los filtros elegidos
              <Boton variante="contorno" tamano="sm" onClick={limpiarFiltros}>
                Limpiar filtros
              </Boton>
            </span>
          ) : (
            'Sin usuarios registrados'
          )
        }
        acciones={{
          puedeEditar: tienePermiso('USUARIO_EDITAR'),
          puedeDarDeBaja: tienePermiso('USUARIO_BAJA'),
          puedeAsignarPermisos: tienePermiso('PERMISO_ASIGNAR'),
        }}
        onEditar={abrirEdicion}
        onDesbloquear={(id) =>
          void ejecutar(
            () => api.post(`/usuarios/${id}/desbloquear`),
            'No se pudo desbloquear',
            'Cuenta desbloqueada: ya puede volver a iniciar sesión',
          )
        }
        onPermisos={(usuario) => setDialogo({ tipo: 'permisos', usuario })}
        onDarDeBaja={setADarDeBaja}
        onReactivar={(usuario) =>
          void ejecutar(
            () => api.post(`/usuarios/${usuario.id}/reactivar`),
            'No se pudo reactivar la cuenta',
            `${usuario.nombreCompleto} vuelve a estar activo: ya puede iniciar sesión`,
          )
        }
      />

      <Paginacion
        pagina={pagina}
        paginas={paginas}
        total={total}
        nombre="usuarios"
        onCambiar={setPagina}
      />

      <p className="mt-3 text-xs text-tinta-tenue">
        {hayFiltros && resumen
          ? `${total} de ${resumen.total} usuario(s) coinciden`
          : `${total} usuario(s)`}
        {' · '}
        Tras 3 intentos fallidos la cuenta se bloquea: un minuto, luego cinco, y a la tercera vez
        hasta que un administrador la desbloquee
      </p>

      <Dialogo
        abierto={aDarDeBaja !== null}
        onCerrar={() => setADarDeBaja(null)}
        titulo="Dar de baja"
        ancho="max-w-md"
      >
        <p className="text-sm text-tinta-suave">
          ¿Dar de baja a <span className="text-tinta">{aDarDeBaja?.nombreCompleto}</span>{' '}
          <span className="font-mono text-tinta-tenue">({aDarDeBaja?.nombreUsuario})</span>?
        </p>
        <p className="mt-2 text-xs text-tinta-tenue">
          La cuenta deja de poder iniciar sesión, y si tiene una sesión abierta se corta en su
          próxima acción. Sus pedidos, ventas y movimientos se conservan, y la cuenta se puede
          reactivar después desde el filtro «De baja».
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Boton variante="fantasma" onClick={() => setADarDeBaja(null)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" cargando={dandoDeBaja} onClick={darDeBaja}>
            Dar de baja
          </Boton>
        </div>
      </Dialogo>

      {dialogo.tipo === 'crear' && (
        <Modal titulo="Nuevo usuario" onCerrar={cerrarDialogo}>
          <FormularioUsuario
            roles={roles}
            onListo={() => alGuardar('Usuario creado. Ya puede iniciar sesión')}
            onCancelar={cerrarDialogo}
          />
        </Modal>
      )}

      {dialogo.tipo === 'editar' && (
        <Modal titulo={`Editar ${dialogo.usuario.nombreUsuario}`} onCerrar={cerrarDialogo}>
          <FormularioUsuario
            roles={roles}
            usuario={dialogo.usuario}
            esPropio={dialogo.usuario.id === sesion?.usuario.id}
            onListo={() => alGuardar('Cambios guardados')}
            onCancelar={cerrarDialogo}
          />
        </Modal>
      )}

      {dialogo.tipo === 'permisos' && (
        <Modal titulo="Asignar permisos" onCerrar={cerrarDialogo}>
          <PanelPermisos
            idUsuario={dialogo.usuario.id}
            nombreUsuario={dialogo.usuario.nombreCompleto}
            onListo={() => alGuardar('Permisos actualizados')}
            onCancelar={cerrarDialogo}
          />
        </Modal>
      )}
    </>
  );
}
