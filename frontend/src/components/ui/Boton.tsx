'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'contorno';
type Tamano = 'sm' | 'md' | 'lg' | 'icono';

const VARIANTES: Record<Variante, string> = {
  primario:
    'bg-marca-500 text-sobre-marca font-semibold shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] ' +
    'hover:bg-marca-400 hover:shadow-[0_10px_30px_-8px_rgba(16,185,129,0.75)]',
  secundario:
    'bg-superficie-suave text-tinta border border-borde hover:bg-superficie-alta hover:border-borde-fuerte',
  contorno:
    'border border-marca-500/40 text-marca-300 hover:bg-marca-500/10 hover:border-marca-500/70',
  fantasma: 'text-tinta-suave hover:bg-white/5 hover:text-tinta',
  peligro: 'bg-peligro/10 text-peligro border border-peligro/25 hover:bg-peligro/20',
};

const TAMANOS: Record<Tamano, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-sm gap-2.5',
  icono: 'h-9 w-9 justify-center',
};

export interface PropsBoton
  extends Omit<HTMLMotionProps<'button'>, 'ref' | 'children'> {
  variante?: Variante;
  tamano?: Tamano;
  cargando?: boolean;
  /** Icono a la izquierda del texto. */
  icono?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Botón del sistema. Nunca usa el aspecto nativo: define sus propios estados
 * de reposo, hover, presionado, carga y deshabilitado.
 */
export function Boton({
  variante = 'secundario',
  tamano = 'md',
  cargando = false,
  icono,
  className,
  children,
  disabled,
  ...props
}: PropsBoton) {
  const inactivo = disabled || cargando;

  return (
    <motion.button
      whileHover={inactivo ? undefined : { y: -1 }}
      whileTap={inactivo ? undefined : { scale: 0.97, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      disabled={inactivo}
      className={cn(
        'relative inline-flex select-none items-center rounded-xl transition-colors duration-200',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTES[variante],
        TAMANOS[tamano],
        className,
      )}
      {...props}
    >
      {cargando ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        icono
      )}
      {children}
    </motion.button>
  );
}
