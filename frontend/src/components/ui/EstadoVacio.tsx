'use client';

import { motion } from 'framer-motion';

/** Estado vacío: explica por qué no hay nada y ofrece la acción que corresponde. */
export function EstadoVacio({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono: React.ReactNode;
  titulo: string;
  descripcion: string;
  accion?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-borde px-6 py-16 text-center"
    >
      <div className="relative mb-5">
        <div className="absolute inset-0 -z-10 blur-2xl bg-marca-500/20 rounded-full" />
        <div className="grid size-14 place-items-center rounded-2xl border border-borde bg-superficie-alta text-tinta-suave">
          {icono}
        </div>
      </div>
      <p className="text-sm font-medium text-tinta">{titulo}</p>
      <p className="mt-1.5 max-w-sm text-sm text-tinta-tenue">{descripcion}</p>
      {accion && <div className="mt-6">{accion}</div>}
    </motion.div>
  );
}
