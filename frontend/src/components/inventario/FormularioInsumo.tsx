'use client';

import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Campo, Interruptor } from '@/components/ui/Campo';
import { Selector } from '@/components/ui/Selector';
import { Boton } from '@/components/ui/Boton';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import type { Insumo, TipoConservacion, UnidadMedida } from '@/types';

/**
 * Alta y edición de insumos (CU-INV-01).
 *
 * La unidad de medida queda bloqueada cuando el insumo ya registra
 * existencias: el stock guardado está expresado en la unidad anterior y
 * cambiarla convertiría 5 kilogramos en 5 gramos sin que nadie lo note. El
 * servidor lo rechaza igualmente; aquí se explica antes de intentarlo.
 */
export function FormularioInsumo({
  insumo,
  onListo,
  onCancelar,
}: {
  insumo?: Insumo;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const { notificar } = useNotificaciones();
  const editando = Boolean(insumo);
  const bloqueaUnidad = Boolean(insumo && insumo.stockTotal > 0);

  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [nombre, setNombre] = useState(insumo?.nombre ?? '');
  const [idUnidad, setIdUnidad] = useState<number | null>(insumo?.unidad.id ?? null);
  const [costo, setCosto] = useState(String(insumo?.costoUnitario ?? ''));
  const [minimo, setMinimo] = useState(String(insumo?.stockMinimo ?? ''));
  const [tipo, setTipo] = useState<TipoConservacion>(insumo?.tipoConservacion ?? 'Seco');
  const [activo, setActivo] = useState(insumo?.activo ?? true);
  const [perecedero, setPerecedero] = useState(insumo?.controlaVencimiento ?? false);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<UnidadMedida[]>('/insumos/unidades')
      .then((lista) => {
        setUnidades(lista);
        setIdUnidad((actual) => actual ?? lista[0]?.id ?? null);
      })
      .catch(() => notificar('error', 'No se pudieron cargar las unidades de medida'));
  }, [notificar]);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    if (idUnidad === null) {
      setError('Seleccione una unidad de medida');
      return;
    }

    const cuerpo = {
      nombre: nombre.trim(),
      idUnidad,
      costoUnitario: Number(costo || 0),
      stockMinimo: Number(minimo || 0),
      tipoConservacion: tipo,
      controlaVencimiento: perecedero,
      ...(editando ? { activo } : {}),
    };

    setEnviando(true);
    try {
      if (editando) {
        await api.put(`/insumos/${insumo!.id}`, cuerpo);
        notificar('exito', 'Insumo actualizado');
      } else {
        await api.post('/insumos', cuerpo);
        notificar('exito', 'Insumo registrado');
      }
      onListo();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar el insumo');
    } finally {
      setEnviando(false);
    }
  }

  const abreviatura = unidades.find((u) => u.id === idUnidad)?.abreviatura;

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo
        etiqueta="Nombre del insumo"
        required
        minLength={2}
        maxLength={100}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Selector<number>
          etiqueta="Unidad de medida"
          valor={idUnidad}
          onCambiar={setIdUnidad}
          deshabilitado={bloqueaUnidad}
          opciones={unidades.map((u) => ({
            valor: u.id,
            etiqueta: u.nombre,
            descripcion: u.abreviatura,
          }))}
          ayuda={bloqueaUnidad ? undefined : 'En qué se mide este insumo'}
        />

        <Selector<TipoConservacion>
          etiqueta="Conservación"
          valor={tipo}
          onCambiar={setTipo}
          opciones={[
            { valor: 'Seco', etiqueta: 'Seco' },
            { valor: 'Refrigerado', etiqueta: 'Refrigerado' },
          ]}
          ayuda="Decide en qué almacén puede guardarse"
        />
      </div>

      {bloqueaUnidad && (
        <p className="flex items-start gap-2 rounded-xl border border-aviso/25 bg-aviso/8 px-3.5 py-2.5 text-xs text-aviso">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          La unidad no puede cambiarse porque el insumo ya registra existencias
          ({insumo!.stockTotal} {insumo!.unidad.abreviatura}). El stock guardado está expresado en
          esa unidad.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Costo unitario"
          type="number"
          step="0.01"
          min="0"
          required
          value={costo}
          onChange={(e) => setCosto(e.target.value)}
          sufijo="Bs"
          ayuda={
            editando
              ? 'Cada compra lo recalcula con el promedio ponderado'
              : 'Costo de partida. Cada compra lo irá recalculando'
          }
        />
        <Campo
          etiqueta="Stock mínimo"
          type="number"
          step="0.01"
          min="0"
          required
          value={minimo}
          onChange={(e) => setMinimo(e.target.value)}
          sufijo={abreviatura}
          ayuda="Genera la alerta de reposición"
        />
      </div>

      <Interruptor
        activo={perecedero}
        onCambiar={setPerecedero}
        etiqueta="Controlar vencimiento"
        descripcion="Al activarlo, cada ingreso de este insumo exigirá su fecha de vencimiento y el consumo saldrá del lote que caduque antes"
      />

      {editando && (
        <Interruptor
          activo={activo}
          onCambiar={setActivo}
          etiqueta="Insumo activo"
          descripcion="Al darlo de baja deja de ofrecerse en recetas e ingresos, pero conserva su historial"
        />
      )}

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
          {editando ? 'Guardar cambios' : 'Registrar insumo'}
        </Boton>
      </div>
    </form>
  );
}
