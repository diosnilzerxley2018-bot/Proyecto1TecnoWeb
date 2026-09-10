'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/** Etiqueta contextual. Aparece con retardo para no distraer al pasar de largo. */
export function Tooltip({
  texto,
  children,
}: {
  texto: string;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, delay: 0.25 }}
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg vidrio px-2.5 py-1.5 text-xs text-tinta shadow-xl"
          >
            {texto}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
