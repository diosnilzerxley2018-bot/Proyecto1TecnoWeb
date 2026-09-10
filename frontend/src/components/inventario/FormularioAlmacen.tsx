'use client';

import { useState } from 'react';
import { Snowflake, Sun } from 'lucide-react';
import { Campo } from '@/components/ui/Campo';
import { Selector } from '@/components/ui/Selector';
import { Boton } from '@/components/ui/Boton';
import { Casilla } from '@/components/ui/Casilla';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import type { Almacen, TipoConservacion } from '@/types';

/**
 * Alta y edición de almacenes (CU-INV-02).
 *
 * El tipo de conservación no es decorativo: decide qué insumos y productos
 * pueden guardarse aquí, y el servidor rechaza los ingresos incompatibles.
 */
export function FormularioAlmacen({
  almacen,
  onListo,
  onCancelar,
}: {
  almacen?: Almacen;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const { notificar } = useNotificaciones();
  const editando = Boolean(almacen);

  const [nombre, setNombre] = useState(almacen?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoConservacion>(almacen?.tipoConservacion ?? 'Seco');
  const [ubicacion, setUbicacion] = useState(almacen?.ubicacionFisica ?? '');
  const [preferido, setPreferido] = useState(almacen?.preferido ?? false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    const cuerpo = {
      nombre: nombre.trim(),
      tipoConservacion: tipo,
      ubicacionFisica: ubicacion.trim() || null,
      preferido,
    };

    try {
      if (editando) {
        await api.put(`/almacenes/${almacen!.id}`, cuerpo);
        notificar('exito', 'Almacén actualizado');
      } else {
        await api.post('/almacenes', cuerpo);
        notificar('exito', 'Almacén registrado');
      }
      onListo();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar el almacén');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo
        etiqueta="Nombre"
        required
        minLength={3}
        maxLength={50}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        ayuda="Debe ser único en el sistema"
      />

      <Selector<TipoConservacion>
        etiqueta="Tipo de conservación"
        valor={tipo}
        onCambiar={setTipo}
        ayuda="Determina qué puede almacenarse aquí"
        opciones={[
          { valor: 'Seco', etiqueta: 'Seco', descripcion: 'Ambiente, sin refrigeración' },
          {
            valor: 'Refrigerado',
            etiqueta: 'Refrigerado',
            descripcion: 'Cadena de frío para perecederos',
          },
        ]}
      />

      <Campo
        etiqueta="Ubicación física"
        maxLength={150}
        value={ubicacion}
        onChange={(e) => setUbicacion(e.target.value)}
        ayuda="Opcional. Por ejemplo: planta baja, depósito"
      />

      <div className="rounded-xl border border-borde bg-white/[0.02] p-3">
        <Casilla
          marcada={preferido}
          onCambiar={() => setPreferido((v) => !v)}
          etiqueta="Destino preferido para producción"
        />
        <p className="mt-1 px-2 text-[11px] leading-relaxed text-tinta-tenue">
          {preferido
            ? `Lo que se produzca con conservación ${tipo.toLowerCase()} entrará aquí sin preguntar. Designar otro liberará a este.`
            : `Con más de un almacén ${tipo.toLowerCase()}, el sistema no puede deducir el destino y lo pregunta en cada producción. Marcar uno evita esa pregunta.`}
        </p>
      </div>

      <div className="flex items-center gap-2.5 rounded-xl border border-borde bg-superficie-alta px-3.5 py-3 text-xs text-tinta-tenue">
        {tipo === 'Refrigerado' ? (
          <Snowflake className="size-4 shrink-0 text-info" aria-hidden />
        ) : (
          <Sun className="size-4 shrink-0 text-aviso" aria-hidden />
        )}
        {tipo === 'Refrigerado'
          ? 'Solo admitirá insumos y productos que requieran refrigeración.'
          : 'Solo admitirá insumos y productos de conservación seca.'}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Boton type="button" variante="fantasma" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" variante="primario" cargando={enviando}>
          {editando ? 'Guardar cambios' : 'Registrar almacén'}
        </Boton>
      </div>
    </form>
  );
}
