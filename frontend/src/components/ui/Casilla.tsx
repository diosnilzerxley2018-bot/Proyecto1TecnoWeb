'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Casilla de verificación propia.
 *
 * El `<input type="checkbox">` nativo apenas admite estilos —`accent-color` es
 * casi todo lo que ofrece—, así que se conserva el input real para que la
 * accesibilidad y el teclado sigan funcionando, pero se oculta y se dibuja el
 * indicador encima.
 */
export function Casilla({
  marcada,
  onCambiar,
  etiqueta,
  className,
}: {
  marcada: boolean;
  onCambiar: () => void;
  etiqueta: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'group flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5',
        'transition-colors duration-150 hover:bg-white/[0.04]',
        className,
      )}
    >
      <span className="relative grid size-4.5 shrink-0 place-items-center">
        <input
          type="checkbox"
          checked={marcada}
          onChange={onCambiar}
          className="peer absolute size-full cursor-pointer opacity-0"
        />
        <motion.span
          animate={{
            backgroundColor: marcada ? 'var(--color-marca-500)' : 'transparent',
            borderColor: marcada ? 'var(--color-marca-500)' : 'var(--color-borde-fuerte)',
          }}
          transition={{ duration: 0.15 }}
          className="grid size-4.5 place-items-center rounded-md border peer-focus-visible:ring-2 peer-focus-visible:ring-marca-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-superficie"
        >
          <AnimatePresence>
            {marcada && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              >
                <Check className="size-3 text-sobre-marca" strokeWidth={3.5} aria-hidden />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.span>
      </span>
      {etiqueta}
    </label>
  );
}
