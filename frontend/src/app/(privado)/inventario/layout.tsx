'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { RequierePermiso } from '@/components/RequierePermiso';
import { seccionesDe } from '@/lib/modulos';
import { cn } from '@/lib/cn';

const PESTANAS = seccionesDe('/inventario');

/**
 * Contenedor del subsistema de inventario.
 *
 * Insumos y almacenes son dos casos de uso distintos —CU-INV-01 y CU-INV-02—
 * pero se consultan juntos, así que comparten un mismo espacio con pestañas en
 * lugar de dos entradas separadas en la navegación principal.
 */
export default function LayoutInventario({ children }: { children: React.ReactNode }) {
  const rutaActual = usePathname();

  return (
    <RequierePermiso permiso="STOCK_CONSULTAR">
      <nav className="mb-8 flex w-full max-w-fit items-center gap-1 overflow-x-auto rounded-xl border border-borde bg-superficie/60 p-1">
        {PESTANAS.map((pestana) => {
          const activa = rutaActual.startsWith(pestana.ruta);
          const Icono = pestana.icono;

          return (
            <Link
              key={pestana.ruta}
              href={pestana.ruta}
              className={cn(
                'relative flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors duration-200',
                activa ? 'text-sobre-marca' : 'text-tinta-suave hover:text-tinta',
              )}
            >
              {activa && (
                <motion.span
                  layoutId="pestana-inventario"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 -z-10 rounded-lg bg-marca-400"
                />
              )}
              <Icono className="size-4" aria-hidden />
              {pestana.etiqueta}
            </Link>
          );
        })}
      </nav>

      {children}
    </RequierePermiso>
  );
}
