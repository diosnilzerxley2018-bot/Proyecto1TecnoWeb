'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sprout } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { BarraLateral } from '@/components/BarraLateral';
import { ProveedorNotificaciones } from '@/components/ui/Notificaciones';
import { PieVisitas } from '@/components/ui/PieVisitas';
import { esPersonalInterno } from '@/lib/dominio';

export default function LayoutPrivado({ children }: { children: React.ReactNode }) {
  const { sesion, cargando } = useAuth();
  const router = useRouter();

  const esCliente = sesion ? !esPersonalInterno(sesion.usuario.rol) : false;

  useEffect(() => {
    if (cargando) return;
    if (!sesion) router.replace('/login');
    // El cliente es un actor externo: su sitio es el portal, no el escritorio.
    // Sin esta guarda vería módulos cuyos permisos no tiene y recibiría un 403
    // al primer clic.
    else if (esCliente) router.replace('/portal');
  }, [sesion, cargando, esCliente, router]);

  if (cargando || !sesion || esCliente) return <PantallaCarga />;

  return (
    <ProveedorNotificaciones>
      <div className="flex min-h-screen">
        <BarraLateral />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 px-4 pb-12 pt-20 sm:px-6 lg:px-10 lg:pt-10">{children}</main>
          <footer className="border-t border-borde px-4 py-5 sm:px-6 lg:px-10">
            <PieVisitas />
          </footer>
        </div>
      </div>
    </ProveedorNotificaciones>
  );
}

/** Evita el salto brusco entre "nada" y la aplicación cargada. */
function PantallaCarga() {
  return (
    <div className="grid min-h-screen place-items-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-2xl bg-marca-500/25" />
          <div className="relative grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-marca-400 to-marca-600 text-sobre-marca">
            <Sprout className="size-6" aria-hidden />
          </div>
        </div>
        <p className="text-sm text-tinta-tenue">Cargando su sesión…</p>
      </motion.div>
    </div>
  );
}
