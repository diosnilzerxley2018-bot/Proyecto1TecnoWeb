'use client';

import { useState } from 'react';
import { Lock, UserRound } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { Campo } from '@/components/ui/Campo';
import { Boton } from '@/components/ui/Boton';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Perfil } from '@/types';

/**
 * Datos personales de la cuenta propia. Comunes al empleado y al cliente.
 *
 * Junto a los campos editables se muestran los que **no** lo son, con el
 * motivo. Omitirlos daría a entender que no existen; mostrarlos apagados y sin
 * explicación deja al usuario preguntándose si es un error de la aplicación.
 */
export function DatosPersonales({
  perfil,
  onActualizado,
}: {
  perfil: Perfil;
  onActualizado: (perfil: Perfil) => void;
}) {
  const { notificar } = useNotificaciones();

  const [nombre, setNombre] = useState(perfil.nombre);
  const [apellido, setApellido] = useState(perfil.apellido);
  const [email, setEmail] = useState(perfil.email);
  const [telefono, setTelefono] = useState(perfil.telefono ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sinCambios =
    nombre === perfil.nombre &&
    apellido === perfil.apellido &&
    email === perfil.email &&
    telefono === (perfil.telefono ?? '');

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      const actualizado = await api.put<Perfil>('/perfil', {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim(),
        telefono: telefono.trim() || null,
      });
      onActualizado(actualizado);
      notificar('exito', 'Datos actualizados');
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudieron guardar los datos');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="superficie-tarjeta rounded-2xl">
      <header className="flex items-center gap-2 border-b border-borde px-5 py-4">
        <UserRound className="size-4 shrink-0 text-marca-400" aria-hidden />
        <h2 className="text-sm font-medium text-tinta">Datos personales</h2>
      </header>

      <form onSubmit={enviar} className="space-y-4 px-5 py-5">
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
          ayuda="A esta dirección llegan los avisos del sistema"
        />

        <Campo
          etiqueta="Teléfono"
          type="tel"
          maxLength={20}
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />

        <div className="grid gap-3 rounded-xl border border-borde bg-white/[0.02] p-3 sm:grid-cols-2">
          <Inmutable
            etiqueta="Nombre de usuario"
            valor={perfil.nombreUsuario}
            motivo="Es la identidad con la que inicia sesión y con la que quedan firmadas sus operaciones. Cambiarla rompería la lectura del historial."
          />
          <Inmutable
            etiqueta="Rol"
            valor={perfil.rol}
            motivo="Lo asigna un administrador. Si el titular pudiera cambiarlo, el control de acceso no controlaría nada."
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
            {error}
          </p>
        )}

        <div className="flex justify-end border-t border-borde pt-4">
          <Boton type="submit" variante="primario" cargando={enviando} disabled={sinCambios}>
            Guardar cambios
          </Boton>
        </div>
      </form>
    </section>
  );
}

/** Campo que se muestra pero no se edita, con el motivo a un toque de distancia. */
function Inmutable({
  etiqueta,
  valor,
  motivo,
}: {
  etiqueta: string;
  valor: string;
  motivo: string;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
        {etiqueta}
        <Tooltip texto={motivo}>
          <span tabIndex={0} className="cursor-help">
            <Lock className="size-3" aria-hidden />
            <span className="sr-only">Por qué no se puede cambiar: {motivo}</span>
          </span>
        </Tooltip>
      </p>
      <p className="truncate text-sm text-tinta-suave">{valor}</p>
    </div>
  );
}
