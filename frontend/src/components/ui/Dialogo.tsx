'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Bloquea el desplazamiento del fondo mientras haya una capa superpuesta. */
function useDesplazamientoBloqueado(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previo;
    };
  }, [activo]);
}

function useEscape(activo: boolean, alCerrar: () => void) {
  useEffect(() => {
    if (!activo) return;
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [activo, alCerrar]);
}

interface PropsBase {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}

/** Diálogo centrado, para formularios cortos y confirmaciones. */
export function Dialogo({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  children,
  ancho = 'max-w-lg',
}: PropsBase & { ancho?: string }) {
  useDesplazamientoBloqueado(abierto);
  useEscape(abierto, onCerrar);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {abierto && (
        <div className="fixed inset-0 z-100 grid place-items-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onCerrar}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className={cn(
              'relative w-full overflow-hidden rounded-2xl vidrio',
              'shadow-[0_40px_100px_-30px_rgba(0,0,0,1)]',
              ancho,
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-borde px-6 py-5">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-tinta">{titulo}</h2>
                {descripcion && (
                  <p className="mt-1 text-sm text-tinta-tenue">{descripcion}</p>
                )}
              </div>
              <BotonCerrar onCerrar={onCerrar} />
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Panel lateral deslizante, para detalle extenso.
 *
 * En pantallas estrechas entra desde abajo y ocupa casi toda la altura: en un
 * teléfono un panel lateral deja una franja inútil y aleja los controles del
 * pulgar.
 */
export function PanelLateral({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  children,
  pie,
}: PropsBase & { pie?: React.ReactNode }) {
  useDesplazamientoBloqueado(abierto);
  useEscape(abierto, onCerrar);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {abierto && (
        <div className="fixed inset-0 z-100 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onCerrar}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className={cn(
              'relative flex h-full w-full max-w-xl flex-col',
              'border-l border-borde bg-superficie shadow-[0_0_120px_-20px_rgba(0,0,0,1)]',
              'max-sm:mt-16 max-sm:max-w-none max-sm:rounded-t-3xl max-sm:border-l-0 max-sm:border-t',
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b border-borde px-6 py-5">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-tinta">{titulo}</h2>
                {descripcion && <p className="mt-1 text-sm text-tinta-tenue">{descripcion}</p>}
              </div>
              <BotonCerrar onCerrar={onCerrar} />
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

            {pie && <footer className="border-t border-borde px-6 py-4">{pie}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function BotonCerrar({ onCerrar }: { onCerrar: () => void }) {
  return (
    <motion.button
      onClick={onCerrar}
      whileHover={{ rotate: 90 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      aria-label="Cerrar"
      className="grid size-8 shrink-0 place-items-center rounded-lg text-tinta-tenue transition-colors hover:bg-white/5 hover:text-tinta"
    >
      <X className="size-4" aria-hidden />
    </motion.button>
  );
}
