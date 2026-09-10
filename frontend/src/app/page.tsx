'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { esPersonalInterno } from '@/lib/dominio';

/** Puerta de entrada: envía a cada actor a su espacio según el rol. */
export default function PaginaRaiz() {
  const { sesion, cargando } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (cargando) return;
    if (!sesion) router.replace('/login');
    else router.replace(esPersonalInterno(sesion.usuario.rol) ? '/inicio' : '/portal');
  }, [sesion, cargando, router]);

  return (
    <div className="grid min-h-screen place-items-center text-sm text-tinta-tenue">Cargando…</div>
  );
}
