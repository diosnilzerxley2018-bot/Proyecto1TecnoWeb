'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { REQUISITOS_CONTRASENA } from '@/lib/dominio';
import { cn } from '@/lib/cn';

/**
 * Los requisitos de la contraseña (RF-SEG-03), marcados **mientras se
 * escribe**: una política que solo se conoce al fallar obliga a adivinar.
 *
 * La usan el cambio desde el perfil y la recuperación con código, para que
 * las dos digan exactamente lo mismo. Aparece recién cuando hay algo escrito.
 */
export function RequisitosContrasena({ valor }: { valor: string }) {
  return (
    <AnimatePresence initial={false}>
      {valor.length > 0 && (
        <motion.ul
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          aria-label="Requisitos de la contraseña"
          className="grid gap-1 overflow-hidden rounded-xl border border-borde bg-white/[0.02] p-3 sm:grid-cols-2"
        >
          {REQUISITOS_CONTRASENA.map((requisito) => {
            const cumple = requisito.cumple(valor);
            return (
              <li
                key={requisito.texto}
                className={cn(
                  'flex items-center gap-1.5 text-[11px] transition-colors',
                  cumple ? 'text-marca-300' : 'text-tinta-tenue',
                )}
              >
                <Check className={cn('size-3 shrink-0', !cumple && 'opacity-25')} aria-hidden />
                {requisito.texto}
              </li>
            );
          })}
        </motion.ul>
      )}
    </AnimatePresence>
  );
}
