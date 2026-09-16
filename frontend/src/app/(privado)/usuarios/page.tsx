'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, ErrorApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { Modal } from '@/components/Modal';
import { FormularioUsuario } from '@/components/FormularioUsuario';
import { PanelPermisos } from '@/components/PanelPermisos';
import { TablaUsuarios } from '@/components/TablaUsuarios';
import { RequierePermiso } from '@/components/RequierePermiso';
import { Paginacion } from '@/components/ui/Paginacion';
import type { Pagina, UsuarioLista, UsuarioDetalle, Rol } from '@/types';

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

export default function PaginaUsuarios() {
  return (
    <RequierePermiso permiso="USUARIO_LEER">
      <ContenidoUsuarios />
    </RequierePermiso>
  );
}

function ContenidoUsuarios() {
  const { tienePermiso } = useAuth();
  const { notificar } = useNotificaciones();

  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>({ tipo: 'ninguno' });

  const mostrarError = (e: unknown, respaldo: string) =>
    setError(e instanceof ErrorApi ? e.message : respaldo);

  /** El listado viene por páginas (H7); el total lo informa el servidor. */
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [total, setTotal] = useState(0);

  const cargarDatos = useCallback(async () => {
    setError(null);
    try {
      const [respuesta, listaRoles] = await Promise.all([
        api.get<Pagina<UsuarioLista>>(`/usuarios?pagina=${pagina}`),
        api.get<Rol[]>('/roles'),
      ]);
      setUsuarios(respuesta.datos);
      setPaginas(respuesta.paginas);
      setTotal(respuesta.total);
      setRoles(listaRoles);
    } catch (e) {
      mostrarError(e, 'No se pudieron cargar los datos');
    } finally {
      setCargando(false);
    }
  }, [pagina]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

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
      await cargarDatos();
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

  function confirmarBaja(usuario: UsuarioLista) {
    if (!confirm(`¿Dar de baja a ${usuario.nombreCompleto}?`)) return;
    void ejecutar(
      () => api.del(`/usuarios/${usuario.id}`),
      'No se pudo dar de baja',
      `${usuario.nombreCompleto} quedó dado de baja`,
    );
  }

  const cerrarDialogo = () => setDialogo({ tipo: 'ninguno' });

  /** Cada diálogo dice qué consiguió: «guardado» a secas no distingue qué. */
  const alGuardar = (mensaje: string) => {
    cerrarDialogo();
    void cargarDatos();
    notificar('exito', mensaje);
  };

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tinta">Administración y Seguridad</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Gestión de usuarios, roles y permisos del sistema
          </p>
        </div>
        {tienePermiso('USUARIO_CREAR') && (
          <button
            onClick={() => setDialogo({ tipo: 'crear' })}
            className="rounded-lg bg-marca-500 px-4 py-2 text-sm font-medium text-sobre-marca hover:bg-marca-400"
          >
            Nuevo usuario
          </button>
        )}
      </header>

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
        onDarDeBaja={confirmarBaja}
      />

      <Paginacion
        pagina={pagina}
        paginas={paginas}
        total={total}
        nombre="usuarios"
        onCambiar={setPagina}
      />

      <p className="mt-3 text-xs text-tinta-tenue">
        {total} usuario(s) · Las cuentas se bloquean tras 3 intentos fallidos consecutivos
      </p>

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
    </div>
  );
}
