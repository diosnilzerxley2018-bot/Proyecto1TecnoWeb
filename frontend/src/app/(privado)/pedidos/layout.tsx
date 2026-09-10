'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChartColumn, ClipboardList } from 'lucide-react';
import { RequierePermiso } from '@/components/RequierePermiso';
import { cn } from '@/lib/cn';

const PESTANAS = [
  { ruta: '/pedidos/lista', etiqueta: 'Pedidos', icono: ClipboardList },
  { ruta: '/pedidos/reportes', etiqueta: 'Reportes', icono: ChartColumn },
];

/**
 * Contenedor del subsistema de pedidos.
 *
 * El seguimiento del día y el reporte del período son la misma información
 * mirada a dos distancias, así que comparten espacio y permiso (`PEDIDO_LEER`)
 * en vez de aparecer como dos módulos separados.
 */
export default function LayoutPedidos({ children }: { children: React.ReactNode }) {
  const rutaActual = usePathname();

  return (
    <RequierePermiso permiso="PEDIDO_LEER">
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
                  layoutId="pestana-pedidos"
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
