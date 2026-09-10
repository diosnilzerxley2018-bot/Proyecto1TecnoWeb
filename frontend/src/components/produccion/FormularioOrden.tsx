'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calculator, TriangleAlert } from 'lucide-react';
import { Campo } from '@/components/ui/Campo';
import { Selector } from '@/components/ui/Selector';
import { Boton } from '@/components/ui/Boton';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import type { Insumo, Producto, Receta } from '@/types';
import { formatearBs, formatearCantidad } from '@/lib/formato';

interface RecetaActiva extends Receta {
  nombreProducto: string;
}

/**
 * Planificación de una corrida de producción (CU-PRO-02).
 *
 * El sistema calcula los insumos dividiendo la cantidad a producir entre el
 * rendimiento de la receta y multiplicando por la cantidad requerida de cada
 * insumo. Ese mismo cálculo se muestra aquí en vivo para que el empleado revise
 * lo que va a consumir antes de confirmar, tal como pide el flujo del actor.
 *
 * La comprobación que decide es del servidor: si faltan insumos, la orden no
 * llega a registrarse.
 */
export function FormularioOrden({
  onListo,
  onCancelar,
}: {
  onListo: () => void;
  onCancelar: () => void;
}) {
  const { notificar } = useNotificaciones();

  const [recetas, setRecetas] = useState<RecetaActiva[]>([]);
  /** El detalle de receta no trae el costo del insumo: se cruza por su id. */
  const [costoPorInsumo, setCostoPorInsumo] = useState<Map<number, number>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [idReceta, setIdReceta] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /**
     * Solo puede producirse a partir de la receta activa del producto, así que
     * se recorren los productos y se conserva la vigente de cada uno.
     */
    async function cargarRecetasActivas() {
      try {
        const [productos, insumos] = await Promise.all([
          api.get<Producto[]>('/productos'),
          api.get<Insumo[]>('/insumos'),
        ]);
        setCostoPorInsumo(new Map(insumos.map((i) => [i.id, i.costoUnitario])));
        const listas = await Promise.all(
          productos.map((producto) =>
            api
              .get<Receta[]>(`/productos/${producto.id}/recetas`)
              .then((versiones) => {
                const activa = versiones.find((v) => v.activa);
                return activa ? { ...activa, nombreProducto: producto.nombre } : null;
              })
              .catch(() => null),
          ),
        );

        const activas = listas.filter((r): r is RecetaActiva => r !== null);
        setRecetas(activas);
        setIdReceta(activas[0]?.id ?? null);
      } catch (e) {
        notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar las recetas');
      } finally {
        setCargando(false);
      }
    }

    void cargarRecetasActivas();
  }, [notificar]);

  const receta = recetas.find((r) => r.id === idReceta) ?? null;
  const porciones = Number(cantidad || 0);

  const calculo = useMemo(() => {
    if (!receta || porciones <= 0) return null;

    const factor = porciones / receta.rendimiento;
    const insumos = receta.insumos.map((insumo) => ({
      ...insumo,
      requerido: Math.round(insumo.cantidadRequerida * factor * 100) / 100,
      costoUnitario: costoPorInsumo.get(insumo.idIngrediente) ?? 0,
    }));

    return { factor, insumos };
  }, [receta, porciones, costoPorInsumo]);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    if (idReceta === null) {
      setError('Seleccione una receta activa');
      return;
    }

    setEnviando(true);
    try {
      await api.post('/ordenes', { idReceta, cantidad: porciones });
      notificar('exito', 'Orden registrada en estado Pendiente');
      onListo();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo registrar la orden');
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return <p className="py-8 text-center text-sm text-tinta-tenue">Buscando recetas activas…</p>;
  }

  if (recetas.length === 0) {
    return (
      <div className="space-y-4 py-4 text-center">
        <TriangleAlert className="mx-auto size-6 text-aviso" aria-hidden />
        <p className="text-sm text-tinta">Ningún producto tiene receta activa</p>
        <p className="text-xs text-tinta-tenue">
          Defina y active una receta desde la pestaña de productos para poder generar órdenes.
        </p>
        <Boton variante="secundario" onClick={onCancelar}>
          Entendido
        </Boton>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <Selector<number>
        etiqueta="Receta activa"
        valor={idReceta}
        onCambiar={setIdReceta}
        opciones={recetas.map((r) => ({
          valor: r.id,
          etiqueta: r.nombreProducto,
          descripcion: `${r.nombre} · rinde ${r.rendimiento}`,
        }))}
      />

      <Campo
        etiqueta="Porciones a producir"
        type="number"
        step="1"
        min="1"
        required
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
        sufijo="porciones"
        ayuda={
          receta
            ? `Una corrida de esta receta rinde ${receta.rendimiento} ${receta.rendimiento === 1 ? 'porción' : 'porciones'}`
            : undefined
        }
      />

      <AnimatePresence mode="wait">
        {calculo && (
          <motion.section
            key={`${idReceta}-${porciones}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-borde bg-white/[0.02] p-4"
          >
            <h3 className="mb-3 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
              <Calculator className="size-3.5" aria-hidden />
              Insumos que consumirá
            </h3>

            <ul className="space-y-1.5">
              {calculo.insumos.map((insumo) => (
                <li
                  key={insumo.idIngrediente}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate text-tinta-suave">{insumo.nombre}</span>
                  <span className="shrink-0 tabular-nums text-tinta">
                    {formatearCantidad(insumo.requerido)} {insumo.unidad}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center justify-between border-t border-borde pt-3">
              <span className="text-xs text-tinta-suave">Costo estimado de la corrida</span>
              <span className="text-sm font-semibold tabular-nums text-marca-300">
                {formatearBs(
                  calculo.insumos.reduce((total, i) => total + i.requerido * i.costoUnitario, 0),
                )}
              </span>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

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
          Registrar orden
        </Boton>
      </div>
    </form>
  );
}
