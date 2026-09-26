'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { seccionesAccesibles } from '@/lib/modulos';
import { cn } from '@/lib/cn';

/**
 * Contenedor del subsistema de producción.
 *
 * Cada pestaña exige su propio permiso —definir productos y ejecutar órdenes
 * son responsabilidades distintas—, de modo que la navegación solo muestra lo
 * que el usuario puede abrir.
 */
export default function LayoutProduccion({ children }: { children: React.ReactNode }) {
  const rutaActual = usePathname();
  const { tienePermiso } = useAuth();

  const visibles = seccionesAccesibles('/produccion', tienePermiso);

  return (
    <>
      {visibles.length > 1 && (
        <nav className="mb-8 flex w-full max-w-fit items-center gap-1 overflow-x-auto rounded-xl border border-borde bg-superficie/60 p-1">
          {visibles.map((pestana) => {
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
                    layoutId="pestana-produccion"
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
      )}

      {children}
    </>
  );
}
