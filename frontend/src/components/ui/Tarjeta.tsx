'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';

/**
 * Superficie elevada del sistema.
 *
 * El degradado sutil de arriba hacia abajo evita el gris plano y da sensación
 * de luz cenital, que es lo que hace que una superficie oscura parezca sólida
 * en lugar de un rectángulo pintado.
 */
export function Tarjeta({
  interactiva = false,
  className,
  children,
  ...props
}: HTMLMotionProps<'div'> & { interactiva?: boolean }) {
  return (
    <motion.div
      whileHover={
        interactiva
          ? { y: -3, borderColor: 'rgba(255,255,255,0.16)' }
          : undefined
      }
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className={cn(
        'superficie-tarjeta rounded-2xl',
        interactiva && 'cursor-pointer hover:shadow-[0_18px_44px_-24px_rgba(0,0,0,0.9)]',
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
