'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChartColumn, History, ScanLine, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/cn';

const PESTANAS = [
  { ruta: '/ventas/registro', etiqueta: 'Punto de venta', icono: ScanLine, permiso: 'VENTA_REGISTRAR' },
  { ruta: '/ventas/historial', etiqueta: 'Historial', icono: History, permiso: 'VENTA_LEER' },
  { ruta: '/ventas/clientes', etiqueta: 'Clientes', icono: Users, permiso: 'CLIENTE_GESTIONAR' },
  { ruta: '/ventas/reportes', etiqueta: 'Reportes', icono: ChartColumn, permiso: 'VENTA_LEER' },
];

/** Contenedor del subsistema de ventas: CU-VEN-01 y CU-VEN-02. */
export default function LayoutVentas({ children }: { children: React.ReactNode }) {
  const rutaActual = usePathname();
  const { tienePermiso } = useAuth();

  const visibles = PESTANAS.filter((p) => tienePermiso(p.permiso));

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
                    layoutId="pestana-ventas"
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
