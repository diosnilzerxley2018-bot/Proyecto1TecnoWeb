'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

/**
 * Nivel de existencias respecto del mínimo.
 *
 * La barra se llena hasta el doble del mínimo: ese punto es "cómodo", el
 * mínimo queda a la mitad y se marca con una guía. Así la lectura es
 * inmediata —¿estoy antes o después de la marca?— sin necesidad de comparar
 * dos números.
 */
export function BarraStock({
  stock,
  minimo,
  className,
}: {
  stock: number;
  minimo: number | null;
  className?: string;
}) {
  if (minimo === null) return null;

  const tope = Math.max(minimo * 2, stock, 1);
  const proporcion = Math.min(stock / tope, 1);
  const marca = Math.min(minimo / tope, 1);

  const critico = stock <= minimo;
  const holgado = stock >= minimo * 1.5;

  return (
    <div className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${proporcion * 100}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className={cn(
          'h-full rounded-full',
          critico ? 'bg-peligro' : holgado ? 'bg-marca-500' : 'bg-aviso',
        )}
      />
      <span
        aria-hidden
        title="Stock mínimo"
        className="absolute top-0 h-full w-px bg-tinta-suave/60"
        style={{ left: `${marca * 100}%` }}
      />
    </div>
  );
}
