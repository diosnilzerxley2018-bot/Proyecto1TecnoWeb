'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { Campo, AreaTexto } from '@/components/ui/Campo';
import { Casilla } from '@/components/ui/Casilla';
import { Selector } from '@/components/ui/Selector';
import { Boton } from '@/components/ui/Boton';
import { Tooltip } from '@/components/ui/Tooltip';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import type { Insumo, Producto, Receta } from '@/types';

interface LineaInsumo {
  uid: string;
  idIngrediente: number | null;
  cantidad: string;
}

const lineaVacia = (): LineaInsumo => ({
  uid: Math.random().toString(36).slice(2),
  idIngrediente: null,
  cantidad: '',
});

/**
 * Alta y edición de una versión de receta (CU-PRO-01).
 *
 * RF-PRO-04 admite varias versiones por producto pero una sola activa, y el
 * esquema lo garantiza con un índice parcial. Por eso una versión nueva nace
 * inactiva: activarla es una operación aparte que desactiva la anterior en la
 * misma transacción. Intentar crear una segunda activa se rechaza.
 */
export function EditorReceta({
  producto,
  receta,
  onListo,
  onCancelar,
}: {
  producto: Producto;
  receta?: Receta;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const { notificar } = useNotificaciones();
  const editando = Boolean(receta);

  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [nombre, setNombre] = useState(receta?.nombre ?? '');
  const [rendimiento, setRendimiento] = useState(String(receta?.rendimiento ?? '1'));
  const [minutos, setMinutos] = useState(String(receta?.tiempoPreparacionMinutos ?? ''));
  const [instrucciones, setInstrucciones] = useState(receta?.instrucciones ?? '');
  const [divisible, setDivisible] = useState(receta?.divisible ?? true);
  const [lineas, setLineas] = useState<LineaInsumo[]>(
    receta
      ? receta.insumos.map((i) => ({
          uid: Math.random().toString(36).slice(2),
          idIngrediente: i.idIngrediente,
          cantidad: String(i.cantidadRequerida),
        }))
      : [lineaVacia()],
  );

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Insumo[]>('/insumos')
      .then(setInsumos)
      .catch(() => notificar('error', 'No se pudieron cargar los insumos'));
  }, [notificar]);

  const porId = new Map(insumos.map((i) => [i.id, i]));

  function actualizar(uid: string, cambios: Partial<LineaInsumo>) {
    setLineas((actuales) => actuales.map((l) => (l.uid === uid ? { ...l, ...cambios } : l)));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    const completas = lineas.filter((l) => l.idIngrediente !== null && Number(l.cantidad) > 0);
    if (completas.length === 0) {
      setError('La receta debe llevar al menos un insumo con su cantidad');
      return;
    }

    const cuerpo = {
      nombre: nombre.trim(),
      rendimiento: Number(rendimiento || 0),
      tiempoPreparacionMinutos: Number(minutos || 0),
      instrucciones: instrucciones.trim() || null,
      divisible,
      insumos: completas.map((l) => ({
        idIngrediente: l.idIngrediente!,
        cantidadRequerida: Number(l.cantidad),
      })),
    };

    setEnviando(true);
    try {
      if (editando) {
        await api.put(`/recetas/${receta!.id}`, cuerpo);
        notificar('exito', 'Receta actualizada');
      } else {
        await api.post(`/productos/${producto.id}/recetas`, cuerpo);
        notificar('exito', 'Versión de receta registrada como inactiva');
      }
      onListo();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar la receta');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <Campo
        etiqueta="Nombre de la versión"
        required
        minLength={2}
        maxLength={100}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        ayuda="Por ejemplo: versión base, versión con mayor rendimiento"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Rendimiento"
          type="number"
          step="1"
          min="1"
          required
          value={rendimiento}
          onChange={(e) => setRendimiento(e.target.value)}
          sufijo="porciones"
          ayuda="Cuántas porciones produce una corrida"
        />
        <Campo
          etiqueta="Tiempo de preparación"
          type="number"
          step="1"
          min="0"
          required
          value={minutos}
          onChange={(e) => setMinutos(e.target.value)}
          sufijo="min"
        />
      </div>

      <div className="rounded-xl border border-borde bg-white/[0.02] p-3">
        <Casilla
          marcada={divisible}
          onCambiar={() => setDivisible((v) => !v)}
          etiqueta="La corrida puede partirse"
        />
        <p className="mt-1 px-2 text-[11px] leading-relaxed text-tinta-tenue">
          {divisible
            ? 'Se prepara la cantidad exacta que haga falta, como un jugo o una ensalada.'
            : `Se prepara siempre en corridas completas de ${rendimiento || 1}: si falta 1, se elaboran ${rendimiento || 1} y el resto queda en inventario. Es lo habitual en horneados.`}
        </p>
      </div>

      <AreaTexto
        etiqueta="Instrucciones"
        maxLength={500}
        value={instrucciones}
        onChange={(e) => setInstrucciones(e.target.value)}
        placeholder="Pasos de elaboración"
        ayuda="Uso interno: nunca salen al catálogo público"
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
            Insumos requeridos
          </h3>
          <Boton
            type="button"
            tamano="sm"
            variante="contorno"
            onClick={() => setLineas((a) => [...a, lineaVacia()])}
            icono={<Plus className="size-3.5" aria-hidden />}
          >
            Agregar insumo
          </Boton>
        </div>

        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {lineas.map((linea) => {
              const insumo = linea.idIngrediente ? porId.get(linea.idIngrediente) : null;

              return (
                <motion.li
                  key={linea.uid}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="flex items-end gap-2">
                    <Selector<number>
                      etiqueta="Insumo"
                      className="flex-1"
                      valor={linea.idIngrediente}
                      onCambiar={(valor) => actualizar(linea.uid, { idIngrediente: valor })}
                      opciones={insumos.map((i) => ({
                        valor: i.id,
                        etiqueta: i.nombre,
                        descripcion: i.unidad.abreviatura,
                      }))}
                    />
                    <Campo
                      etiqueta="Cantidad"
                      className="w-32 shrink-0"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={linea.cantidad}
                      onChange={(e) => actualizar(linea.uid, { cantidad: e.target.value })}
                      sufijo={insumo?.unidad.abreviatura}
                    />
                    <Tooltip texto="Quitar">
                      <Boton
                        type="button"
                        tamano="icono"
                        variante="fantasma"
                        aria-label="Quitar insumo"
                        disabled={lineas.length === 1}
                        onClick={() => setLineas((a) => a.filter((l) => l.uid !== linea.uid))}
                        className="mb-0.5 hover:bg-peligro/15 hover:text-peligro"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Boton>
                    </Tooltip>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>

      {!editando && (
        <p className="rounded-xl border border-borde bg-white/[0.02] px-3.5 py-2.5 text-xs text-tinta-tenue">
          La versión se registra inactiva. Para que reemplace a la vigente, actívela desde la lista
          de versiones: el sistema desactiva la anterior en la misma operación.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="fantasma" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" variante="primario" cargando={enviando}>
          {editando ? 'Guardar cambios' : 'Registrar versión'}
        </Boton>
      </div>
    </form>
  );
}
