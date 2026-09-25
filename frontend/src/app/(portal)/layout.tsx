'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Info,
  LogOut,
  ReceiptText,
  ShoppingBasket,
  Sprout,
  UserRound,
  UtensilsCrossed,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CarritoProvider, useCarrito } from '@/context/CarritoContext';
import { ProveedorNotificaciones } from '@/components/ui/Notificaciones';
import { Tooltip } from '@/components/ui/Tooltip';
import { SelectorTema } from '@/components/ui/SelectorTema';
import { PieVisitas } from '@/components/ui/PieVisitas';
import { BuscadorSitio } from '@/components/portal/BuscadorSitio';
import { esPersonalInterno } from '@/lib/dominio';
import type { Negocio } from '@/types';
import { cn } from '@/lib/cn';

const ENLACES = [
  // El catálogo no usa la canasta: esa es del carrito. En el celular se ven
  // solo los íconos, y dos canastas iguales no se distinguían.
  { ruta: '/portal', etiqueta: 'Catálogo', icono: UtensilsCrossed, exacta: true },
  { ruta: '/portal/pedidos', etiqueta: 'Mis pedidos', icono: ReceiptText, exacta: false },
  { ruta: '/portal/perfil', etiqueta: 'Mi cuenta', icono: UserRound, exacta: false },
  // RF-PED-03: la informacion del negocio es una pagina mas del portal.
  { ruta: '/portal/nosotros', etiqueta: 'Nosotros', icono: Info, exacta: false },
];

/**
 * Marco del portal de pedidos.
 *
 * El cliente no comparte espacio con el personal: no tiene barra lateral de
 * módulos ni acceso al escritorio de gestión. Es un actor externo del sistema
 * y su interfaz es un sitio de compra, no un panel de administración.
 */
export default function LayoutPortal({ children }: { children: React.ReactNode }) {
  const { sesion, cargando } = useAuth();
  const router = useRouter();

  const esPersonal = sesion ? esPersonalInterno(sesion.usuario.rol) : false;

  useEffect(() => {
    if (cargando) return;
    if (!sesion) router.replace('/login');
    // El personal interno tiene su propio escritorio; aquí no pinta nada.
    else if (esPersonal) router.replace('/inicio');
  }, [sesion, cargando, esPersonal, router]);

  if (cargando || !sesion || esPersonal) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-tinta-tenue">
        Cargando el portal…
      </div>
    );
  }

  return (
    <ProveedorNotificaciones>
      <CarritoProvider>
        <div className="flex min-h-screen flex-col">
          <Cabecera nombre={sesion.usuario.nombre} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-8 sm:px-6">
            {children}
          </main>
          <Pie />
        </div>
      </CarritoProvider>
    </ProveedorNotificaciones>
  );
}

function Cabecera({ nombre }: { nombre: string }) {
  const rutaActual = usePathname();
  const { cerrarSesion } = useAuth();
  const { cantidadTotal } = useCarrito();

  return (
    <header className="sticky top-0 z-50 border-b border-borde vidrio">
      {/*
        En un teléfono el buscador baja a su propia fila.
        
        Logo, buscador, cuatro enlaces, carrito, tema y salir no caben en 360
        px: apretados en una sola línea, el buscador queda de unos pocos
        píxeles y deja de servir. `flex-wrap` con `order` los reordena sin
        duplicar el marcado.
      */}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6">
        <Link href="/portal" className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-marca-400 to-marca-600 text-sobre-marca">
            <Sprout className="size-5" aria-hidden />
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-semibold leading-tight text-tinta">NutriExpress</span>
            <span className="block text-[11px] text-tinta-tenue">Comida saludable</span>
          </span>
        </Link>

        {/* RF-PED-03: buscar productos e informacion desde el encabezado. */}
        <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
          <BuscadorSitio />
        </div>

        <nav className="ml-auto flex items-center gap-1 sm:ml-0">
          {ENLACES.map((enlace) => {
            const activo = enlace.exacta
              ? rutaActual === enlace.ruta
              : rutaActual.startsWith(enlace.ruta);
            const Icono = enlace.icono;

            return (
              <Link
                key={enlace.ruta}
                href={enlace.ruta}
                // En el celular el texto se oculta y el enlace quedaba sin
                // nombre para un lector de pantalla.
                aria-label={enlace.etiqueta}
                title={enlace.etiqueta}
                className={cn(
                  'relative flex items-center gap-2 rounded-xl px-2 py-2 text-sm transition-colors duration-200 sm:px-3',
                  activo ? 'text-tinta' : 'text-tinta-suave hover:text-tinta',
                )}
              >
                {activo && (
                  <motion.span
                    layoutId="portal-activo"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 -z-10 rounded-xl border border-marca-500/25 bg-marca-500/10"
                  />
                )}
                <Icono className={cn('size-4 shrink-0', activo && 'text-marca-400')} aria-hidden />
                <span className="hidden md:block">{enlace.etiqueta}</span>
              </Link>
            );
          })}

          <Link
            href="/portal/carrito"
            aria-label={`Carrito con ${cantidadTotal} artículo(s)`}
            className={cn(
              'relative ml-1 flex items-center gap-2 rounded-xl border px-2 py-2 text-sm transition-colors duration-200 sm:px-3',
              cantidadTotal > 0
                ? 'border-marca-500/40 bg-marca-500/12 text-marca-300'
                : 'border-borde text-tinta-suave hover:border-borde-fuerte hover:text-tinta',
            )}
          >
            <ShoppingBasket className="size-4" aria-hidden />
            {cantidadTotal > 0 && (
              <motion.span
                key={cantidadTotal}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-marca-400 text-[10px] font-semibold text-sobre-marca"
              >
                {cantidadTotal}
              </motion.span>
            )}
          </Link>

          <span className="ml-1">
            <SelectorTema compacto />
          </span>

          <Tooltip texto={`Cerrar sesión de ${nombre}`}>
            <button
              onClick={cerrarSesion}
              aria-label="Cerrar sesión"
              className="ml-1 grid size-9 place-items-center rounded-xl text-tinta-tenue transition-colors hover:bg-peligro/15 hover:text-peligro"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </Tooltip>
        </nav>
      </div>
    </header>
  );
}

/**
 * El nombre y el lema salen de la configuración (RF-PED-03), no del código:
 * escritos aquí a mano serían una segunda copia que se desincroniza en cuanto
 * el administrador los edita.
 */
function Pie() {
  const [negocio, setNegocio] = useState<Negocio | null>(null);

  useEffect(() => {
    api.get<Negocio>('/negocio').then(setNegocio).catch(() => {
      // El pie no vale una interrupción: si no llega, se queda sin la frase.
    });
  }, []);

  return (
    <footer className="border-t border-borde px-4 py-6 text-center sm:px-6">
      <p className="text-xs text-tinta-tenue">
        {negocio ? `${negocio.nombre} · ${negocio.lema}` : ' '}
      </p>
      <div className="mt-2">
        <PieVisitas />
      </div>
    </footer>
  );
}
