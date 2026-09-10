'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChefHat, Clock, Layers, Pencil, Plus, Trash2, Utensils } from 'lucide-react';
import { Boton } from '@/components/ui/Boton';
import { Insignia } from '@/components/ui/Insignia';
import { Dialogo } from '@/components/ui/Dialogo';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Tooltip } from '@/components/ui/Tooltip';
import { EditorReceta } from './EditorReceta';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import type { Producto, Receta } from '@/types';
import { formatearCantidad } from '@/lib/formato';
import { cn } from '@/lib/cn';

/**
 * Versiones de receta de un producto (RF-PRO-04).
 *
 * Un producto admite varias versiones y una sola activa. La activación es una
 * operación explícita porque el informe distingue dos situaciones: registrar
 * una segunda receta activa se rechaza —es un accidente—, mientras que activar
 * una versión concreta desactiva la anterior —es una decisión deliberada—.
 */
export function PanelRecetas({
  producto,
  puedeGestionar,
}: {
  producto: Producto;
  puedeGestionar: boolean;
}) {
  const { notificar } = useNotificaciones();

  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Receta | null>(null);
  const [porEliminar, setPorEliminar] = useState<Receta | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      setRecetas(await api.get<Receta[]>(`/productos/${producto.id}/recetas`));
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar las recetas');
    } finally {
      setCargando(false);
    }
  }, [producto.id, notificar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function activar(receta: Receta) {
    setOcupado(receta.id);
    try {
      await api.post(`/recetas/${receta.id}/activar`);
      notificar('exito', `"${receta.nombre}" es ahora la receta activa`);
      await cargar();
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo activar la versión');
    } finally {
      setOcupado(null);
    }
  }

  async function eliminar() {
    if (!porEliminar) return;
    setOcupado(porEliminar.id);
    try {
      await api.del(`/recetas/${porEliminar.id}`);
      notificar('exito', 'Versión eliminada');
      setPorEliminar(null);
      await cargar();
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo eliminar la versión');
    } finally {
      setOcupado(null);
    }
  }

  if (cargando) return <EsqueletoFilas filas={2} alto="h-28" />;

  return (
    <div className="space-y-4">
      {puedeGestionar && recetas.length > 0 && (
        <div className="flex justify-end">
          <Boton
            variante="contorno"
            tamano="sm"
            onClick={() => setCreando(true)}
            icono={<Plus className="size-3.5" aria-hidden />}
          >
            Nueva versión
          </Boton>
        </div>
      )}

      {recetas.length === 0 ? (
        <EstadoVacio
          icono={<ChefHat className="size-6" aria-hidden />}
          titulo="Este producto no tiene receta"
          descripcion="Sin receta activa no puede generarse una orden de producción para elaborarlo."
          accion={
            puedeGestionar && (
              <Boton variante="primario" onClick={() => setCreando(true)}>
                Definir la receta
              </Boton>
            )
          }
        />
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence mode="popLayout">
            {recetas.map((receta) => (
              <TarjetaReceta
                key={receta.id}
                receta={receta}
                puedeGestionar={puedeGestionar}
                ocupada={ocupado === receta.id}
                onActivar={() => activar(receta)}
                onEditar={() => setEditando(receta)}
                onEliminar={() => setPorEliminar(receta)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Dialogo
        abierto={creando}
        onCerrar={() => setCreando(false)}
        ancho="max-w-2xl"
        titulo="Nueva versión de receta"
        descripcion={producto.nombre}
      >
        <EditorReceta
          producto={producto}
          onCancelar={() => setCreando(false)}
          onListo={() => {
            setCreando(false);
            void cargar();
          }}
        />
      </Dialogo>

      <Dialogo
        abierto={editando !== null}
        onCerrar={() => setEditando(null)}
        ancho="max-w-2xl"
        titulo={`Editar ${editando?.nombre ?? ''}`}
      >
        {editando && (
          <EditorReceta
            producto={producto}
            receta={editando}
            onCancelar={() => setEditando(null)}
            onListo={() => {
              setEditando(null);
              void cargar();
            }}
          />
        )}
      </Dialogo>

      <Dialogo
        abierto={porEliminar !== null}
        onCerrar={() => setPorEliminar(null)}
        titulo="Eliminar versión"
        ancho="max-w-md"
      >
        <p className="text-sm text-tinta-suave">
          ¿Confirma eliminar <span className="text-tinta">{porEliminar?.nombre}</span>?
        </p>
        <p className="mt-2 text-xs text-tinta-tenue">
          Una versión con órdenes de producción registradas conserva su historial y no puede
          eliminarse.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Boton variante="fantasma" onClick={() => setPorEliminar(null)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" cargando={ocupado !== null} onClick={eliminar}>
            Eliminar
          </Boton>
        </div>
      </Dialogo>
    </div>
  );
}

function TarjetaReceta({
  receta,
  puedeGestionar,
  ocupada,
  onActivar,
  onEditar,
  onEliminar,
}: {
  receta: Receta;
  puedeGestionar: boolean;
  ocupada: boolean;
  onActivar: () => void;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.26, ease: 'easeOut' }}
      className={cn(
        'rounded-2xl border p-4 transition-colors duration-300',
        receta.activa
          ? 'border-marca-500/30 bg-marca-500/[0.06]'
          : 'border-borde bg-white/[0.02]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-tinta">{receta.nombre}</p>
            {receta.activa ? (
              <Insignia tono="marca" punto>
                Activa
              </Insignia>
            ) : (
              <Insignia tono="neutro">Inactiva</Insignia>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-tinta-tenue">
            <span className="inline-flex items-center gap-1.5">
              <Utensils className="size-3.5" aria-hidden />
              rinde {receta.rendimiento} {receta.rendimiento === 1 ? 'porción' : 'porciones'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden />
              {receta.tiempoPreparacionMinutos} min
            </span>
            {!receta.divisible && (
              <span className="inline-flex items-center gap-1.5 text-info">
                <Layers className="size-3.5" aria-hidden />
                solo corridas completas
              </span>
            )}
          </div>
        </div>

        {puedeGestionar && (
          <div className="flex shrink-0 gap-1">
            {!receta.activa && (
              <Tooltip texto="Activar esta versión">
                <Boton
                  tamano="icono"
                  variante="fantasma"
                  cargando={ocupada}
                  onClick={onActivar}
                  aria-label="Activar versión"
                  className="hover:bg-marca-500/15 hover:text-marca-300"
                >
                  <CheckCircle2 className="size-4" aria-hidden />
                </Boton>
              </Tooltip>
            )}
            <Tooltip texto="Editar">
              <Boton tamano="icono" variante="fantasma" onClick={onEditar} aria-label="Editar receta">
                <Pencil className="size-4" aria-hidden />
              </Boton>
            </Tooltip>
            <Tooltip texto="Eliminar">
              <Boton
                tamano="icono"
                variante="fantasma"
                onClick={onEliminar}
                aria-label="Eliminar receta"
                className="hover:bg-peligro/15 hover:text-peligro"
              >
                <Trash2 className="size-4" aria-hidden />
              </Boton>
            </Tooltip>
          </div>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-borde pt-3">
        {receta.insumos.map((insumo) => (
          <li
            key={insumo.idIngrediente}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px]',
              insumo.insumoActivo
                ? 'border-borde bg-white/[0.03] text-tinta-suave'
                : 'border-peligro/25 bg-peligro/[0.06] text-peligro',
            )}
            title={insumo.insumoActivo ? undefined : 'Este insumo fue dado de baja'}
          >
            {insumo.nombre}
            <span className="tabular-nums text-tinta">
              {formatearCantidad(insumo.cantidadRequerida)} {insumo.unidad}
            </span>
          </li>
        ))}
      </ul>

      {receta.instrucciones && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-tinta-tenue">
          {receta.instrucciones}
        </p>
      )}
    </motion.li>
  );
}
