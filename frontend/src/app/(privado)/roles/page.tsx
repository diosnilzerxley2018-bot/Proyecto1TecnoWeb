'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, ErrorApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { Modal } from '@/components/Modal';
import { FormularioRol } from '@/components/FormularioRol';
import { RequierePermiso } from '@/components/RequierePermiso';
import type { Rol, Permiso } from '@/types';

/** CU-SEG-03 Gestionar Rol y Permisos */

type Dialogo = { tipo: 'ninguno' } | { tipo: 'crear' } | { tipo: 'editar'; rol: Rol };

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
                  <button
                    onClick={() => setDialogo({ tipo: 'editar', rol })}
                    className="text-xs font-medium text-marca-300 hover:underline"
                  >
                    Editar
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {rol.permisos.length === 0 && (
                  <span className="text-xs text-tinta-tenue">Sin permisos asignados</span>
                )}
                {rol.permisos.map((p) => (
                  <span
                    key={p.id}
                    className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-tinta-suave"
                  >
                    {p.nombre}
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
    </div>
  );
}
