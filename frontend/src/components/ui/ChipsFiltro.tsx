'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface Chip<T extends string> {
  valor: T;
  etiqueta: string;
  cantidad?: number;
}

/**
 * Filtro por segmentos con indicador deslizante.
 *
 * El fondo del segmento activo es un único elemento compartido con `layoutId`,
 * de modo que Framer Motion lo desplaza entre opciones en lugar de desvanecer
 * uno y aparecer otro. El movimiento comunica que es el mismo control.
 */
export function ChipsFiltro<T extends string>({
  opciones,
  valor,
  onCambiar,
  idGrupo,
}: {
  opciones: Chip<T>[];
  valor: T;
  onCambiar: (valor: T) => void;
  idGrupo: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-borde bg-superficie/60 p-1">
      {opciones.map((opcion) => {
        const activo = opcion.valor === valor;
        return (
          <button
            key={opcion.valor}
            onClick={() => onCambiar(opcion.valor)}
            className={cn(
              'relative rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-200',
              activo ? 'text-sobre-marca' : 'text-tinta-suave hover:text-tinta',
            )}
          >
            {activo && (
              <motion.span
                layoutId={idGrupo}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 -z-10 rounded-lg bg-marca-400"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {opcion.etiqueta}
              {opcion.cantidad !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                    activo ? 'bg-black/20' : 'bg-white/8',
                  )}
                >
                  {opcion.cantidad}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
