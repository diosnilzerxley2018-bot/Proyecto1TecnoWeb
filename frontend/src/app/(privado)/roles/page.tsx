'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, ErrorApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { Modal } from '@/components/Modal';
import { FormularioRol } from '@/components/FormularioRol';
import { RequierePermiso } from '@/components/RequierePermiso';
import { Boton } from '@/components/ui/Boton';
import { motivoParaNoEliminar } from '@/lib/roles';
import type { Rol, Permiso } from '@/types';
import { describirPermiso } from '@/lib/roles';

/** CU-SEG-03 Gestionar Rol y Permisos */

type Dialogo =
  | { tipo: 'ninguno' }
  | { tipo: 'crear' }
  | { tipo: 'editar'; rol: Rol }
  | { tipo: 'eliminar'; rol: Rol };

export default function PaginaRoles() {
  return (
    <RequierePermiso permiso="ROL_LEER">
      <ContenidoRoles />
    </RequierePermiso>
  );
}

function ContenidoRoles() {
  const { tienePermiso } = useAuth();
  const { notificar } = useNotificaciones();

  const [roles, setRoles] = useState<Rol[]>([]);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>({ tipo: 'ninguno' });
  const [eliminando, setEliminando] = useState(false);

  const cargarDatos = useCallback(async () => {
    setError(null);
    try {
      const [listaRoles, listaPermisos] = await Promise.all([
        api.get<Rol[]>('/roles'),
        api.get<Permiso[]>('/roles/permisos'),
      ]);
      setRoles(listaRoles);
      setPermisos(listaPermisos);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar los datos');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const cerrarDialogo = () => setDialogo({ tipo: 'ninguno' });

  const alGuardar = (mensaje: string) => {
    cerrarDialogo();
    void cargarDatos();
    notificar('exito', mensaje);
  };

  /**
   * El error se avisa y el diálogo se cierra igual: si el servidor lo rechazó
   * —porque alguien le asignó el rol a un usuario mientras tanto, por
   * ejemplo— la lista recargada muestra por qué.
   */
  async function eliminar(rol: Rol) {
    setEliminando(true);
    try {
      await api.del(`/roles/${rol.id}`);
      alGuardar(`Rol ${rol.nombre} eliminado`);
    } catch (e) {
      cerrarDialogo();
      void cargarDatos();
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo eliminar el rol');
    } finally {
      setEliminando(false);
    }
  }

  const puedeGestionar = tienePermiso('ROL_GESTIONAR');

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tinta">Roles y permisos</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Define los permisos que corresponden a cada rol del sistema
          </p>
        </div>
        {puedeGestionar && (
          <button
            onClick={() => setDialogo({ tipo: 'crear' })}
            className="rounded-lg bg-marca-500 px-4 py-2 text-sm font-medium text-sobre-marca hover:bg-marca-400"
          >
            Nuevo rol
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

      {cargando ? (
        <p className="text-tinta-tenue">Cargando…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.map((rol) => (
            <article
              key={rol.id}
              className="rounded-xl bg-superficie p-5 shadow-sm ring-1 ring-borde"
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-tinta">{rol.nombre}</h2>
                  <p className="text-xs text-tinta-tenue">
                    {rol.cantidadUsuarios} usuario(s) · {rol.permisos.length} permiso(s)
                  </p>
                </div>
                {puedeGestionar && (
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      onClick={() => setDialogo({ tipo: 'editar', rol })}
                      className="text-xs font-medium text-marca-300 hover:underline"
                    >
                      Editar
                    </button>
                    <BotonEliminar rol={rol} onEliminar={() => setDialogo({ tipo: 'eliminar', rol })} />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {rol.permisos.length === 0 && (
                  <span className="text-xs text-tinta-tenue">Sin permisos asignados</span>
                )}
                {/* La frase, y el código al pasar el puntero: el código solo no
                    le dice nada a quien no escribió el sistema. */}
                {rol.permisos.map((p) => (
                  <span
                    key={p.id}
                    title={p.nombre}
                    className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-tinta-suave"
                  >
                    {describirPermiso(p.nombre)}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {dialogo.tipo === 'crear' && (
        <Modal titulo="Nuevo rol" onCerrar={cerrarDialogo} ancho="max-w-2xl">
          <FormularioRol
            permisosDisponibles={permisos}
            onListo={() => alGuardar('Rol creado')}
            onCancelar={cerrarDialogo}
          />
        </Modal>
      )}

      {dialogo.tipo === 'editar' && (
        <Modal titulo={`Editar rol ${dialogo.rol.nombre}`} onCerrar={cerrarDialogo} ancho="max-w-2xl">
          <FormularioRol
            permisosDisponibles={permisos}
            rol={dialogo.rol}
            onListo={() => alGuardar('Rol actualizado. Los permisos retirados se quitaron de sus usuarios')}
            onCancelar={cerrarDialogo}
          />
        </Modal>
      )}

      {dialogo.tipo === 'eliminar' && (
        <Modal titulo="Eliminar rol" onCerrar={cerrarDialogo} ancho="max-w-md">
          <p className="text-sm text-tinta-suave">
            ¿Eliminar el rol <span className="font-medium text-tinta">{dialogo.rol.nombre}</span>?
          </p>
          <p className="mt-2 text-xs text-tinta-tenue">
            {dialogo.rol.permisos.length > 0
              ? `Se quitan también los ${dialogo.rol.permisos.length} permiso(s) que definía. `
              : ''}
            No se puede deshacer.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Boton variante="fantasma" onClick={cerrarDialogo} disabled={eliminando}>
              Cancelar
            </Boton>
            <Boton
              variante="peligro"
              cargando={eliminando}
              onClick={() => void eliminar(dialogo.rol)}
            >
              Eliminar rol
            </Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Deshabilitado —no escondido— cuando el rol no se puede borrar: así el
 * administrador ve que la acción existe y el motivo por el que ahora no
 * aplica, en vez de preguntarse dónde está.
 */
function BotonEliminar({ rol, onEliminar }: { rol: Rol; onEliminar: () => void }) {
  const motivo = motivoParaNoEliminar(rol);

  return (
    <button
      onClick={onEliminar}
      disabled={motivo !== null}
      title={motivo ?? `Eliminar el rol ${rol.nombre}`}
      aria-label={motivo ? `No se puede eliminar: ${motivo}` : `Eliminar el rol ${rol.nombre}`}
      className="text-xs font-medium text-peligro hover:underline disabled:cursor-not-allowed disabled:text-tinta-tenue disabled:no-underline"
    >
      Eliminar
    </button>
  );
}
