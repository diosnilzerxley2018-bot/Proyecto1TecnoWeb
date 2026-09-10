'use client';

import { motion } from 'framer-motion';

/** Encabezado común: título, contexto y acciones de la sección. */
export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion: string;
  acciones?: React.ReactNode;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-tinta">{titulo}</h1>
        <p className="mt-1.5 text-sm text-tinta-tenue">{descripcion}</p>
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
    </motion.header>
  );
}
