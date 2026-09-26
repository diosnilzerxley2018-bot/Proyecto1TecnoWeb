'use client';

import type { UsuarioLista } from '@/types';
import { TextoResaltado } from '@/components/ui/TextoResaltado';

/**
 * Traduce el estado del usuario a una etiqueta visual.
 *
 * La baja se mira primero, igual que en los filtros del servidor: una cuenta
 * dada de baja que además quedó bloqueada es «De baja», porque ya no puede
 * entrar de ninguna forma y desbloquearla no cambiaría nada.
 */
function EtiquetaEstado({ usuario }: { usuario: UsuarioLista }) {
  if (!usuario.activo) {
    return <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-tinta-tenue">De baja</span>;
  }
  if (usuario.bloqueado) {
    return (
      <span className="rounded-full bg-peligro/10 px-2 py-0.5 text-xs text-peligro">Bloqueado</span>
    );
  }
  return (
    <span className="rounded-full bg-marca-500/12 px-2 py-0.5 text-xs text-marca-300">Activo</span>
  );
}

interface AccionesDisponibles {
  puedeEditar: boolean;
  /** Dar de baja y reactivar: el mismo permiso, `USUARIO_BAJA`. */
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
  onReactivar: (usuario: UsuarioLista) => void;
  /**
   * La cuenta de quien mira. En su fila no se ofrecen la baja ni los
   * permisos: el servidor los rechaza, porque son cambios que se los tiene
   * que hacer otro administrador.
   */
  idPropio?: number;
  /** Lo que se está buscando, para resaltarlo en cada fila. */
  busqueda?: string;
  /** Qué mostrar cuando no hay filas: no es lo mismo "no hay usuarios" que "no coincide ninguno". */
  vacio?: React.ReactNode;
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
  onReactivar,
  idPropio,
  busqueda = '',
  vacio = 'Sin usuarios registrados',
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

        {/* Tokens del tema y no colores crudos: `divide-slate-100` dibujaba
            líneas casi blancas entre filas en el modo noche. */}
        <tbody className="divide-y divide-borde">
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
                {vacio}
              </td>
            </tr>
          )}

          {usuarios.map((usuario) => (
            <tr key={usuario.id} className="hover:bg-white/[0.03]">
              <td className="px-4 py-3 font-mono text-tinta-suave">
                <TextoResaltado texto={usuario.nombreUsuario} busqueda={busqueda} />
                {usuario.id === idPropio && (
                  <span className="ml-2 rounded-full bg-marca-500/12 px-1.5 py-0.5 font-sans text-[10px] text-marca-300">
                    usted
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-tinta">
                <TextoResaltado texto={usuario.nombreCompleto} busqueda={busqueda} />
              </td>
              <td className="px-4 py-3 text-tinta-suave">
                <TextoResaltado texto={usuario.email} busqueda={busqueda} />
              </td>
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
                  {usuario.activo && usuario.bloqueado && acciones.puedeEditar && (
                    <button
                      onClick={() => onDesbloquear(usuario.id)}
                      className="font-medium text-aviso hover:underline"
                    >
                      Desbloquear
                    </button>
                  )}
                  {acciones.puedeAsignarPermisos && usuario.id !== idPropio && (
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
                  {usuario.activo && acciones.puedeDarDeBaja && usuario.id !== idPropio && (
                    <button
                      onClick={() => onDarDeBaja(usuario)}
                      className="font-medium text-peligro hover:underline"
                    >
                      Dar de baja
                    </button>
                  )}
                  {!usuario.activo && acciones.puedeDarDeBaja && (
                    <button
                      onClick={() => onReactivar(usuario)}
                      className="font-medium text-marca-300 hover:underline"
                    >
                      Reactivar
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
