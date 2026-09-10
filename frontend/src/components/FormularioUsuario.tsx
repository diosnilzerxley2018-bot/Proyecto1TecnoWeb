'use client';

import { useState, useEffect } from 'react';
import { api, ErrorApi } from '@/lib/api';
import { CampoTexto } from '@/components/CampoTexto';
import { Selector } from '@/components/ui/Selector';
import { ROL_CLIENTE, esPersonalInterno } from '@/lib/dominio';
import type { Rol, UsuarioDetalle, Cargo } from '@/types';

/**
 * CU-SEG-02 Gestionar Usuario — alta y edición.
 *
 * Según el rol elegido, el formulario pide los datos de la especialización:
 * cargo y fecha de ingreso para el personal interno, preferencias
 * alimentarias para los clientes.
 */
export function FormularioUsuario({
  roles,
  usuario,
  onListo,
  onCancelar,
}: {
  roles: Rol[];
  usuario?: UsuarioDetalle | null;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const editando = Boolean(usuario);

  const rolInicial = usuario
    ? (roles.find((r) => r.nombre === usuario.rol)?.id ?? roles[0]?.id ?? 0)
    : (roles[0]?.id ?? 0);

  const [datos, setDatos] = useState({
    nombre: usuario?.nombre ?? '',
    apellido: usuario?.apellido ?? '',
    email: usuario?.email ?? '',
    telefono: usuario?.telefono ?? '',
    nombreUsuario: usuario?.nombreUsuario ?? '',
    contrasena: '',
    idRol: rolInicial,
    idCargo: 0,
    fechaIngreso: '',
    preferenciaAlimentaria: usuario?.preferenciaAlimentaria ?? '',
    restriccionDietetica: usuario?.restriccionDietetica ?? '',
  });

  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<Cargo[]>('/cargos')
      .then((lista) => {
        setCargos(lista);
        setDatos((prev) => (prev.idCargo === 0 ? { ...prev, idCargo: lista[0]?.id ?? 0 } : prev));
      })
      .catch(() => setCargos([]));
  }, []);

  const nombreRolElegido = roles.find((r) => r.id === datos.idRol)?.nombre ?? '';
  const requiereCargo = esPersonalInterno(nombreRolElegido);

  /**
   * Al editar no se permite saltar entre personal interno y cliente:
   * la especialización ya está registrada y puede tener operaciones asociadas.
   */
  const rolesDisponibles = editando
    ? roles.filter((r) => esPersonalInterno(r.nombre) === esPersonalInterno(usuario!.rol))
    : roles;

  function actualizar<K extends keyof typeof datos>(clave: K, valor: (typeof datos)[K]) {
    setDatos((prev) => ({ ...prev, [clave]: valor }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      if (editando) {
        await api.put(`/usuarios/${usuario!.id}`, {
          nombre: datos.nombre,
          apellido: datos.apellido,
          email: datos.email,
          telefono: datos.telefono || null,
          idRol: datos.idRol,
        });
      } else {
        await api.post('/usuarios', {
          nombre: datos.nombre,
          apellido: datos.apellido,
          email: datos.email,
          telefono: datos.telefono || null,
          nombreUsuario: datos.nombreUsuario,
          contrasena: datos.contrasena,
          idRol: datos.idRol,
          ...(requiereCargo
            ? {
                idCargo: datos.idCargo,
                ...(datos.fechaIngreso ? { fechaIngreso: datos.fechaIngreso } : {}),
              }
            : {
                preferenciaAlimentaria: datos.preferenciaAlimentaria || null,
                restriccionDietetica: datos.restriccionDietetica || null,
              }),
        });
      }
      onListo();
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'Error inesperado');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <CampoTexto id="nombre" etiqueta="Nombre" required
          value={datos.nombre} onChange={(e) => actualizar('nombre', e.target.value)} />
        <CampoTexto id="apellido" etiqueta="Apellido" required
          value={datos.apellido} onChange={(e) => actualizar('apellido', e.target.value)} />
      </div>

      <CampoTexto id="email" etiqueta="Correo electrónico" type="email" required
        value={datos.email} onChange={(e) => actualizar('email', e.target.value)} />

      <div className="grid grid-cols-2 gap-3">
        <CampoTexto id="telefono" etiqueta="Teléfono"
          value={datos.telefono} onChange={(e) => actualizar('telefono', e.target.value)} />
        <Selector<number>
          etiqueta="Rol"
          valor={datos.idRol}
          onCambiar={(valor) => actualizar('idRol', valor)}
          ayuda={editando ? 'No se puede cambiar entre personal y cliente' : undefined}
          opciones={rolesDisponibles.map((r) => ({ valor: r.id, etiqueta: r.nombre }))}
        />
      </div>

      {!editando && requiereCargo && (
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-white/[0.03] p-3 ring-1 ring-borde">
          <Selector<number>
            etiqueta="Cargo"
            valor={datos.idCargo}
            onCambiar={(valor) => actualizar('idCargo', valor)}
            opciones={cargos.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
          />
          <CampoTexto id="fechaIngreso" etiqueta="Fecha de ingreso" type="date"
            value={datos.fechaIngreso} onChange={(e) => actualizar('fechaIngreso', e.target.value)}
            ayuda="Si se omite, se usa la fecha de hoy" />
        </div>
      )}

      {!editando && !requiereCargo && (
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-white/[0.03] p-3 ring-1 ring-borde">
          <CampoTexto id="preferencia" etiqueta="Preferencia alimentaria"
            value={datos.preferenciaAlimentaria}
            onChange={(e) => actualizar('preferenciaAlimentaria', e.target.value)} />
          <CampoTexto id="restriccion" etiqueta="Restricción dietética"
            value={datos.restriccionDietetica}
            onChange={(e) => actualizar('restriccionDietetica', e.target.value)} />
        </div>
      )}

      {!editando && (
        <>
          <CampoTexto id="nombreUsuario" etiqueta="Nombre de usuario" required minLength={4}
            value={datos.nombreUsuario} onChange={(e) => actualizar('nombreUsuario', e.target.value)} />
          <CampoTexto id="contrasena" etiqueta="Contraseña" type="password" required
            value={datos.contrasena} onChange={(e) => actualizar('contrasena', e.target.value)}
            ayuda="Mínimo 8 caracteres, con al menos una letra y un número" />
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-peligro/10 px-3 py-2 text-sm text-peligro ring-1 ring-peligro/25">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancelar}
          className="rounded-lg px-4 py-2 text-sm text-tinta-suave hover:bg-white/5">
          Cancelar
        </button>
        <button type="submit" disabled={enviando}
          className="rounded-lg bg-marca-500 px-4 py-2 text-sm font-medium text-sobre-marca hover:bg-marca-400 disabled:opacity-50">
          {enviando ? 'Guardando…' : editando ? 'Guardar cambios' : `Crear ${nombreRolElegido === ROL_CLIENTE ? 'cliente' : 'usuario'}`}
        </button>
      </div>
    </form>
  );
}
