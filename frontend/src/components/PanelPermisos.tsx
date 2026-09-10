'use client';

import { Casilla } from '@/components/ui/Casilla';

import { useEffect, useState } from 'react';
import { api, ErrorApi } from '@/lib/api';
import type { PermisoUsuario } from '@/types';

/** CU-SEG-04 Asignar Permisos a Usuario */
export function PanelPermisos({
  idUsuario, nombreUsuario, onListo, onCancelar,
}: {
  idUsuario: number;
  nombreUsuario: string;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [permisos, setPermisos] = useState<PermisoUsuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<PermisoUsuario[]>(`/usuarios/${idUsuario}/permisos`)
      .then(setPermisos)
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'Error al cargar'))
      .finally(() => setCargando(false));
  }, [idUsuario]);

  function alternar(id: number) {
    setPermisos((prev) =>
      prev.map((p) => (p.idRolPermiso === id ? { ...p, habilitado: !p.habilitado } : p)),
    );
  }

  async function guardar() {
    setError(null);
    setEnviando(true);
    try {
      await api.put(`/usuarios/${idUsuario}/permisos`, {
        idsRolPermiso: permisos.filter((p) => p.habilitado).map((p) => p.idRolPermiso),
      });
      onListo();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Error al guardar');
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <p className="text-sm text-tinta-tenue">Cargando permisos…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta-suave">
        Permisos disponibles para el rol de <strong>{nombreUsuario}</strong>.
        Marque los que desea habilitarle.
      </p>

      {permisos.length === 0 ? (
        <p className="rounded-lg bg-aviso/10 px-3 py-2 text-sm text-aviso ring-1 ring-aviso/25">
          El rol de este usuario no tiene permisos definidos. Configúrelos primero en Gestionar rol y permisos.
        </p>
      ) : (
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-borde p-2">
          {permisos.map((p) => (
            <Casilla
              key={p.idRolPermiso}
              marcada={p.habilitado}
              onCambiar={() => alternar(p.idRolPermiso)}
              etiqueta={<span className="font-mono text-sm text-tinta-suave">{p.permiso}</span>}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-tinta-tenue">
        {permisos.filter((p) => p.habilitado).length} de {permisos.length} habilitados
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-peligro/10 px-3 py-2 text-sm text-peligro ring-1 ring-peligro/25">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm text-tinta-suave hover:bg-white/5">
          Cancelar
        </button>
        <button onClick={guardar} disabled={enviando || permisos.length === 0}
          className="rounded-lg bg-marca-500 px-4 py-2 text-sm font-medium text-sobre-marca hover:bg-marca-400 disabled:opacity-50">
          {enviando ? 'Guardando…' : 'Guardar permisos'}
        </button>
      </div>
    </div>
  );
}
