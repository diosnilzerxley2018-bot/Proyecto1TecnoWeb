'use client';

import type { UsuarioLista } from '@/types';

/** Traduce el estado del usuario a una etiqueta visual. */
function EtiquetaEstado({ usuario }: { usuario: UsuarioLista }) {
  if (usuario.bloqueado) {
    return (
      <span className="rounded-full bg-peligro/10 px-2 py-0.5 text-xs text-peligro">Bloqueado</span>
    );
  }
  if (usuario.activo) {
    return (
      <span className="rounded-full bg-marca-500/12 px-2 py-0.5 text-xs text-marca-300">Activo</span>
    );
  }
  return <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-tinta-tenue">De baja</span>;
}

interface AccionesDisponibles {
  puedeEditar: boolean;
  puedeDarDeBaja: boolean;
  puedeAsignarPermisos: boolean;
}

interface Props {
  usuarios: UsuarioLista[];
  cargando: boolean;
  acciones: AccionesDisponibles;
  onEditar: (id: number) => void;
  onDesbloquear: (id: number) => void;
  onPermisos: (usuario: UsuarioLista) => void;
  onDarDeBaja: (usuario: UsuarioLista) => void;
}

const COLUMNAS = ['Usuario', 'Nombre completo', 'Correo', 'Rol', 'Estado'];

export function TablaUsuarios({
  usuarios,
  cargando,
  acciones,
  onEditar,
  onDesbloquear,
  onPermisos,
  onDarDeBaja,
}: Props) {
  const totalColumnas = COLUMNAS.length + 1;

  return (
    /*
     * La tabla se desplaza dentro de su propia caja.
     *
     * Con seis columnas no entra en un teléfono, y sin esto el desborde lo
     * hereda la página entera: se desplaza en horizontal completa, con la
     * barra lateral y el encabezado incluidos. `min-w` mantiene las columnas
     * legibles en vez de aplastarlas hasta partir cada palabra.
     */
    <div className="overflow-x-auto rounded-xl bg-superficie shadow-sm ring-1 ring-borde">
      <table className="w-full min-w-[46rem] text-left text-sm">
        <thead className="border-b border-borde bg-white/[0.03] text-xs uppercase tracking-wide text-tinta-tenue">
          <tr>
            {COLUMNAS.map((c) => (
              <th key={c} className="px-4 py-3">
                {c}
              </th>
            ))}
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {cargando && (
            <tr>
              <td colSpan={totalColumnas} className="px-4 py-8 text-center text-tinta-tenue">
                Cargando…
              </td>
            </tr>
          )}

          {!cargando && usuarios.length === 0 && (
            <tr>
              <td colSpan={totalColumnas} className="px-4 py-8 text-center text-tinta-tenue">
                Sin usuarios registrados
              </td>
            </tr>
          )}

          {usuarios.map((usuario) => (
            <tr key={usuario.id} className="hover:bg-white/[0.03]">
              <td className="px-4 py-3 font-mono text-tinta-suave">{usuario.nombreUsuario}</td>
              <td className="px-4 py-3 text-tinta">{usuario.nombreCompleto}</td>
              <td className="px-4 py-3 text-tinta-suave">{usuario.email}</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-tinta-suave">
                  {usuario.rol}
                </span>
              </td>
              <td className="px-4 py-3">
                <EtiquetaEstado usuario={usuario} />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-3 text-xs">
                  {usuario.bloqueado && acciones.puedeEditar && (
                    <button
                      onClick={() => onDesbloquear(usuario.id)}
                      className="font-medium text-amber-600 hover:underline"
                    >
                      Desbloquear
                    </button>
                  )}
                  {acciones.puedeAsignarPermisos && (
                    <button
                      onClick={() => onPermisos(usuario)}
                      className="font-medium text-tinta-suave hover:underline"
                    >
                      Permisos
                    </button>
                  )}
                  {acciones.puedeEditar && (
                    <button
                      onClick={() => onEditar(usuario.id)}
                      className="font-medium text-marca-300 hover:underline"
                    >
                      Editar
                    </button>
                  )}
                  {usuario.activo && acciones.puedeDarDeBaja && (
                    <button
                      onClick={() => onDarDeBaja(usuario)}
                      className="font-medium text-peligro hover:underline"
                    >
                      Dar de baja
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
