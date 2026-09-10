'use client';

import { motion } from 'framer-motion';
import { Ban, Check } from 'lucide-react';
import type { EstadoPedido } from '@/types';
import { ETIQUETA_ESTADO, ORDEN_FLUJO } from '@/lib/pedidos';
import { cn } from '@/lib/cn';

/**
 * Progreso del pedido a lo largo del flujo.
 *
 * Un pedido cancelado no pertenece al flujo —sale de él—, así que se muestra
 * como un estado aparte en lugar de forzarlo dentro de la secuencia.
 */
export function LineaDeTiempo({ estado }: { estado: EstadoPedido }) {
  if (estado === 'Cancelado') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-peligro/25 bg-peligro/8 px-4 py-3">
        <Ban className="size-4 shrink-0 text-peligro" aria-hidden />
        <div>
          <p className="text-sm text-peligro">Pedido cancelado</p>
          <p className="mt-0.5 text-xs text-tinta-tenue">
            El stock descontado fue repuesto al inventario.
          </p>
        </div>
      </div>
    );
  }

  const indiceActual = ORDEN_FLUJO.indexOf(estado);

  return (
    <ol className="relative flex justify-between">
      <div className="absolute left-0 right-0 top-3.5 -z-10 h-px bg-borde" aria-hidden />
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: indiceActual / (ORDEN_FLUJO.length - 1) }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="absolute left-0 right-0 top-3.5 -z-10 h-px origin-left bg-marca-500"
        aria-hidden
      />

      {ORDEN_FLUJO.map((paso, indice) => {
        const completado = indice < indiceActual;
        const actual = indice === indiceActual;

        return (
          <li key={paso} className="flex flex-col items-center gap-2">
            <motion.span
              initial={false}
              animate={{ scale: actual ? 1.1 : 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className={cn(
                'grid size-7 place-items-center rounded-full border text-[11px] font-semibold',
                completado && 'border-marca-500 bg-marca-500 text-sobre-marca',
                actual && 'border-marca-400 bg-superficie text-marca-300 ring-4 ring-marca-500/15',
                !completado && !actual && 'border-borde bg-superficie text-tinta-tenue',
              )}
            >
              {completado ? <Check className="size-3.5" aria-hidden /> : indice + 1}
            </motion.span>
            <span
              className={cn(
                'max-w-20 text-center text-[10px] leading-tight',
                actual ? 'font-medium text-tinta' : 'text-tinta-tenue',
              )}
            >
              {ETIQUETA_ESTADO[paso]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
