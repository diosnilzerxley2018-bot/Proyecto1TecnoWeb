'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChefHat, Loader2, PackagePlus, TriangleAlert } from 'lucide-react';
import { Selector } from '@/components/ui/Selector';
import type { EvaluacionVenta, LineaEvaluacion } from '@/types';
import { formatearBs, formatearCantidad } from '@/lib/formato';

/**
 * Producción al instante — extensión de CU-VEN-01.
 *
 * Cuando el mostrador pide más de lo que hay elaborado, el sistema no se limita
 * a decir «stock insuficiente»: muestra qué se prepararía, con qué insumos y a
 * qué costo, y deja que el vendedor confirme. Solo se produce **lo que falta**,
 * no lo que pidió el cliente.
 */
export function PanelProduccion({
  evaluacion,
  cargando,
  destinos,
  onElegirDestino,
}: {
  evaluacion: EvaluacionVenta | null;
  cargando: boolean;
  destinos: Record<number, number>;
  onElegirDestino: (idProducto: number, idAlmacen: number) => void;
}) {
  const pendientes = evaluacion?.lineas.filter((l) => l.requiereProduccion) ?? [];

  if (cargando && pendientes.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-borde bg-white/[0.02] px-3.5 py-2.5 text-xs text-tinta-tenue">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Comprobando existencias…
      </p>
    );
  }

  if (pendientes.length === 0) return null;

  const costo = pendientes.reduce((suma, l) => suma + l.costoProduccion, 0);
  const bloqueadas = pendientes.filter((l) => !l.producible);

  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      aria-label="Producción al instante"
      className="rounded-xl border border-aviso/25 bg-aviso/[0.07] p-3.5"
    >
      <header className="flex items-center gap-2">
        <ChefHat className="size-4 shrink-0 text-aviso" aria-hidden />
        <h3 className="text-xs font-medium text-tinta">Se preparará al instante</h3>
        {cargando && (
          <Loader2 className="ml-auto size-3.5 animate-spin text-tinta-tenue" aria-hidden />
        )}
      </header>

      <p className="mt-1.5 text-[11px] leading-relaxed text-tinta-tenue">
        No alcanza lo elaborado. Solo se produce el faltante, no todo lo pedido.
      </p>

      <ul className="mt-3 space-y-2.5">
        <AnimatePresence initial={false}>
          {pendientes.map((linea) => (
            <motion.li
              key={linea.idProducto}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <LineaProduccion
                linea={linea}
                destino={destinos[linea.idProducto] ?? null}
                onElegirDestino={(idAlmacen) => onElegirDestino(linea.idProducto, idAlmacen)}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {evaluacion && evaluacion.insumosFaltantes.length > 0 && (
        <div className="mt-3 rounded-lg border border-peligro/25 bg-peligro/10 px-3 py-2.5">
          <p className="flex items-start gap-2 text-xs text-peligro">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Por separado alcanzan, pero no para todo el ticket junto: hay productos que
              comparten el mismo insumo.
            </span>
          </p>
          <ul className="mt-1.5 space-y-1 pl-5.5">
            {evaluacion.insumosFaltantes.map((insumo) => (
              <li key={insumo.nombre} className="text-[11px] tabular-nums text-peligro/80">
                {insumo.nombre}: hay {formatearCantidad(insumo.disponible)} {insumo.unidad}, hacen
                falta {formatearCantidad(insumo.requerido)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {bloqueadas.length === 0 && evaluacion?.insumosFaltantes.length === 0 && (
        <p className="mt-3 flex items-center justify-between border-t border-aviso/20 pt-2.5 text-[11px]">
          <span className="text-tinta-tenue">Costo de los insumos</span>
          <span className="tabular-nums text-tinta-suave">{formatearBs(costo)}</span>
        </p>
      )}
    </motion.section>
  );
}

function LineaProduccion({
  linea,
  destino,
  onElegirDestino,
}: {
  linea: LineaEvaluacion;
  destino: number | null;
  onElegirDestino: (idAlmacen: number) => void;
}) {
  if (!linea.producible) {
    return (
      <div className="rounded-lg border border-peligro/25 bg-peligro/10 px-3 py-2.5">
        <p className="flex items-start gap-2 text-xs text-peligro">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">{linea.nombre}</span>
            {': '}
            {linea.motivo ?? 'no puede elaborarse'}
          </span>
        </p>
        {linea.insumosFaltantes.length > 0 && (
          <ul className="mt-1.5 space-y-1 pl-5.5">
            {linea.insumosFaltantes.map((insumo) => (
              <li key={insumo.nombre} className="text-[11px] tabular-nums text-peligro/80">
                {insumo.nombre}: hay {formatearCantidad(insumo.disponible)} {insumo.unidad}, hacen
                falta {formatearCantidad(insumo.requerido)}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-1.5 pl-5.5 text-[11px] text-peligro/80">
          Hay {linea.enStock} en existencias y se piden {linea.solicitado}. Reduzca la cantidad
          para poder cobrar.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white/[0.04] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-tinta">{linea.nombre}</p>
        <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-aviso">
          <PackagePlus className="size-3.5" aria-hidden />
          {linea.cantidadAProducir}
        </span>
      </div>

      <p className="mt-1 text-[11px] text-tinta-tenue">
        {linea.enStock} en existencias · faltan {linea.faltante}
        {linea.excedente > 0 && (
          <>
            {' · '}
            <span className="text-info">
              la receta rinde de más: {linea.excedente} queda{linea.excedente === 1 ? '' : 'n'} en
              inventario
            </span>
          </>
        )}
      </p>

      <ul className="mt-2 space-y-1">
        {linea.insumos.map((insumo) => (
          <li
            key={insumo.idIngrediente}
            className="flex items-center justify-between gap-3 text-[11px]"
          >
            <span className="min-w-0 truncate text-tinta-tenue">{insumo.nombre}</span>
            <span className="shrink-0 tabular-nums text-tinta-suave">
              {formatearCantidad(insumo.cantidadRequerida)} {insumo.unidad}
            </span>
          </li>
        ))}
      </ul>

      {linea.requiereElegirAlmacen && (
        <div className="mt-2.5">
          <Selector<number>
            etiqueta="Almacén de destino"
            valor={destino}
            onCambiar={onElegirDestino}
            opciones={linea.almacenesCompatibles.map((a) => ({
              valor: a.id,
              etiqueta: a.nombre,
            }))}
            ayuda="Varios almacenes admiten este producto: elija dónde ingresa lo elaborado"
          />
        </div>
      )}
    </div>
  );
}
