'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { seccionesAccesibles } from '@/lib/modulos';

/**
 * La raíz de un módulo lleva a su primera pestaña que el usuario puede abrir.
 *
 * La barra lateral ya enlaza ahí; esto cubre a quien escribe la dirección o
 * vuelve a ella con el navegador. Redirigir siempre a la misma pestaña dejaba
 * frente a «Acceso no autorizado» a quien tenía permiso para otra: el
 * cocinero con órdenes pero sin productos, el cajero sin historial.
 */
export function EntradaModulo({ ruta }: { ruta: string }) {
  const router = useRouter();
  const { tienePermiso } = useAuth();
  const destino = seccionesAccesibles(ruta, tienePermiso)[0]?.ruta ?? '/inicio';

  useEffect(() => {
    router.replace(destino);
  }, [router, destino]);

  return null;
}
