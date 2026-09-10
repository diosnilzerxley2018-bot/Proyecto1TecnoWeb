'use client';

import { useState } from 'react';
import { Leaf } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { Campo } from '@/components/ui/Campo';
import { Boton } from '@/components/ui/Boton';
import type { Perfil } from '@/types';

/**
 * Preferencias alimentarias del cliente.
 *
 * Es lo único del perfil que existe solo para este tipo de cuenta, y por eso
 * es lo único que no se comparte con el perfil del personal. Todo lo demás
 * —datos personales, contraseña, resumen— usa los mismos componentes.
 */
export function PreferenciasCliente({
  perfil,
  onActualizado,
}: {
  perfil: Perfil;
  onActualizado: (perfil: Perfil) => void;
}) {
  const { notificar } = useNotificaciones();
  const preferencias = perfil.preferencias;

  const [preferencia, setPreferencia] = useState(preferencias?.preferenciaAlimentaria ?? '');
  const [restriccion, setRestriccion] = useState(preferencias?.restriccionDietetica ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sinCambios =
    preferencia === (preferencias?.preferenciaAlimentaria ?? '') &&
    restriccion === (preferencias?.restriccionDietetica ?? '');

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      const actualizado = await api.put<Perfil>('/perfil/preferencias', {
        preferenciaAlimentaria: preferencia.trim() || null,
        restriccionDietetica: restriccion.trim() || null,
      });
      onActualizado(actualizado);
      notificar('exito', 'Preferencias guardadas');
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudieron guardar las preferencias');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="superficie-tarjeta rounded-2xl">
      <header className="flex items-center gap-2 border-b border-borde px-5 py-4">
        <Leaf className="size-4 shrink-0 text-marca-400" aria-hidden />
        <h2 className="text-sm font-medium text-tinta">Preferencias alimentarias</h2>
      </header>

      <form onSubmit={enviar} className="space-y-4 px-5 py-5">
        <Campo
          etiqueta="Preferencia alimentaria"
          maxLength={100}
          value={preferencia}
          onChange={(e) => setPreferencia(e.target.value)}
          placeholder="Ej.: vegetariana"
        />
        <Campo
          etiqueta="Restricción dietética"
          maxLength={100}
          value={restriccion}
          onChange={(e) => setRestriccion(e.target.value)}
          placeholder="Ej.: sin gluten"
          ayuda="Nos ayuda a recomendarle mejor y a preparar su pedido con cuidado"
        />

        {error && (
          <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
            {error}
          </p>
        )}

        <div className="flex justify-end border-t border-borde pt-4">
          <Boton type="submit" variante="primario" cargando={enviando} disabled={sinCambios}>
            Guardar preferencias
          </Boton>
        </div>
      </form>
    </section>
  );
}
