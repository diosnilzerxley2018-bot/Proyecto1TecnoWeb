'use client';

import { Casilla } from '@/components/ui/Casilla';

import { useState } from 'react';
import { api, ErrorApi } from '@/lib/api';
import type { Permiso, Rol } from '@/types';

/**
 * CU-SEG-03 Gestionar Rol y Permisos.
 *
 * Advertencia del caso de uso: al retirar un permiso del rol, el sistema
 * lo retira también de los usuarios que lo tuvieran habilitado.
 */
export function FormularioRol({
  permisosDisponibles,
  rol,
  onListo,
  onCancelar,
}: {
  permisosDisponibles: Permiso[];
  rol?: Rol | null;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const editando = Boolean(rol);

  const [nombre, setNombre] = useState(rol?.nombre ?? '');
  const [seleccionados, setSeleccionados] = useState<number[]>(
    rol?.permisos.map((p) => p.id) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const permisosOriginales = rol?.permisos.map((p) => p.id) ?? [];
  const retirados = permisosOriginales.filter((id) => !seleccionados.includes(id));

  function alternar(id: number) {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const cuerpo = { nombre, idsPermiso: seleccionados };
      if (editando) {
        await api.put(`/roles/${rol!.id}`, cuerpo);
      } else {
        await api.post('/roles', cuerpo);
      }
      onListo();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Error inesperado');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div>
        <label htmlFor="nombreRol" className="mb-1 block text-sm text-tinta-suave">
          Nombre del rol
        </label>
        <input
          id="nombreRol"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          maxLength={50}
          className="w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/30"
        />
      </div>

      <div>
        <p className="mb-2 text-sm text-tinta-suave">
          Permisos del rol
          <span className="ml-2 text-xs text-tinta-tenue">
            ({seleccionados.length} de {permisosDisponibles.length})
          </span>
        </p>
        <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-borde p-2">
          {permisosDisponibles.map((p) => (
            <Casilla
              key={p.id}
              marcada={seleccionados.includes(p.id)}
              onCambiar={() => alternar(p.id)}
              etiqueta={<span className="font-mono text-xs text-tinta-suave">{p.nombre}</span>}
            />
          ))}
        </div>
      </div>

      {retirados.length > 0 && (
        <p className="rounded-lg bg-aviso/10 px-3 py-2 text-sm text-amber-800 ring-1 ring-aviso/25">
          Va a retirar {retirados.length} permiso(s). También se quitarán a los usuarios que los
          tuvieran habilitados.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-peligro/10 px-3 py-2 text-sm text-peligro ring-1 ring-peligro/25"
        >
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg px-4 py-2 text-sm text-tinta-suave hover:bg-white/5"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-marca-500 px-4 py-2 text-sm font-medium text-sobre-marca hover:bg-marca-400 disabled:opacity-50"
        >
          {enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear rol'}
        </button>
      </div>
    </form>
  );
}
