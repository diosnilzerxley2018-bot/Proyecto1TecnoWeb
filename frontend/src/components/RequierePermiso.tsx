'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

/**
 * Oculta el contenido de una página cuando el usuario no tiene el permiso.
 *
 * Es una comodidad de la interfaz, no un control de seguridad: la restricción
 * que manda es la del servidor, que vuelve a verificar el permiso en cada
 * petición (RNF-SEG-04). Esto solo evita que el usuario llegue a una pantalla
 * que igualmente le devolvería 403.
 */
export function RequierePermiso({
  permiso,
  children,
}: {
  permiso: string;
  children: React.ReactNode;
}) {
  const { tienePermiso } = useAuth();

  if (tienePermiso(permiso)) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md rounded-xl bg-superficie p-8 text-center shadow-sm ring-1 ring-borde">
      <h1 className="text-lg font-semibold text-tinta">Acceso no autorizado</h1>
      <p className="mt-2 text-sm text-tinta-suave">
        No tiene el permiso necesario para ver esta sección.
      </p>
      <Link
        href="/inicio"
        className="mt-5 inline-block rounded-lg bg-marca-500 px-4 py-2 text-sm font-medium text-sobre-marca hover:bg-marca-400"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
