'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import type { Tono } from './Insignia';

const ACENTOS: Record<Tono, string> = {
  neutro: 'text-tinta-suave',
  marca: 'text-marca-400',
  aviso: 'text-aviso',
  peligro: 'text-peligro',
  info: 'text-info',
  violeta: 'text-violeta',
};

/** Cifra destacada con su etiqueta. Entra escalonada según su posición. */
export function Estadistica({
  etiqueta,
  valor,
  icono,
  tono = 'neutro',
  indice = 0,
}: {
  etiqueta: string;
  valor: string | number;
  icono: React.ReactNode;
  tono?: Tono;
  indice?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: indice * 0.06, ease: 'easeOut' }}
      className="superficie-tarjeta flex items-center gap-3 rounded-2xl px-4 py-3.5"
    >
      <span className={cn('shrink-0', ACENTOS[tono])}>{icono}</span>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none tracking-tight text-tinta tabular-nums">
          {valor}
        </p>
        <p className="mt-1.5 truncate text-[11px] uppercase tracking-wider text-tinta-tenue">
          {etiqueta}
        </p>
      </div>
    </motion.div>
  );
}
