'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, LogOut, Menu, Sprout, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { modulosAccesibles, type ModuloAccesible } from '@/lib/modulos';
import { Tooltip } from '@/components/ui/Tooltip';
import { SelectorTema } from '@/components/ui/SelectorTema';
import { BotonBuscar } from '@/components/buscador/BuscadorGeneral';
import { cn } from '@/lib/cn';

/**
 * Navegación principal.
 *
 * En escritorio es una columna fija; por debajo de `lg` se convierte en un
 * panel que entra desde la izquierda, porque 16 rem de barra fija sobre una
 * pantalla de teléfono dejarían el contenido sin espacio utilizable.
 */
export function BarraLateral() {
  const [abierta, setAbierta] = useState(false);
  const rutaActual = usePathname();

  // Al navegar, el panel móvil se cierra solo: dejarlo abierto tapa el destino.
  useEffect(() => setAbierta(false), [rutaActual]);

  return (
    <>
      {/*
        En el celular, una barra con fondo y no un botón suelto: el botón
        flotante quedaba encima del contenido al hacer scroll y tapaba títulos
        y direcciones, justo en la pantalla que el repartidor usa en la calle.
      */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 border-b border-borde bg-superficie/90 px-4 backdrop-blur-xl lg:hidden">
        <button
          onClick={() => setAbierta(true)}
          aria-label="Abrir menú"
          className="grid size-10 place-items-center rounded-xl text-tinta transition-colors hover:bg-white/5"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <span className="flex items-center gap-2 text-sm font-medium text-tinta">
          <Sprout className="size-4 text-marca-400" aria-hidden />
          NutriExpress
        </span>
        <span className="ml-auto">
          <BotonBuscar compacto />
        </span>
      </div>

      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed flex h-screen w-64 flex-col border-r border-borde bg-superficie/70 backdrop-blur-xl">
          <Contenido rutaActual={rutaActual} />
        </div>
      </aside>

      <AnimatePresence>
        {abierta && (
          <div className="fixed inset-0 z-100 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAbierta(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              className="relative flex h-full w-72 flex-col border-r border-borde bg-superficie"
            >
              <button
                onClick={() => setAbierta(false)}
                aria-label="Cerrar menú"
                className="absolute right-3 top-4 grid size-8 place-items-center rounded-lg text-tinta-tenue hover:bg-white/5 hover:text-tinta"
              >
                <X className="size-4" aria-hidden />
              </button>
              <Contenido rutaActual={rutaActual} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function Contenido({ rutaActual }: { rutaActual: string }) {
  const { sesion, cerrarSesion, tienePermiso } = useAuth();
  const modulos = modulosAccesibles(tienePermiso, sesion?.usuario.cargo);

  const iniciales = `${sesion?.usuario.nombre?.[0] ?? ''}${sesion?.usuario.apellido?.[0] ?? ''}`;

  return (
    <>
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="relative">
          <div className="absolute inset-0 -z-10 rounded-xl bg-marca-500/30 blur-lg" />
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-marca-400 to-marca-600 text-sobre-marca">
            <Sprout className="size-5" aria-hidden />
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-tinta">NutriExpress</p>
          <p className="truncate text-[11px] text-tinta-tenue">Comida saludable</p>
        </div>
      </div>

      <div className="px-3 pb-3">
        <BotonBuscar />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        <Enlace
          href="/inicio"
          activo={rutaActual === '/inicio'}
          icono={<Home className="size-4" aria-hidden />}
          etiqueta="Inicio"
        />

        <p className="px-3 pb-1.5 pt-5 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
          Módulos
        </p>

        {modulos.map((modulo) => (
          <ElementoModulo key={modulo.ruta} modulo={modulo} rutaActual={rutaActual} />
        ))}
      </nav>

      <div className="border-t border-borde p-3">
        <div className="mb-2 px-2">
          <SelectorTema />
        </div>
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          {/* La ficha del usuario lleva a su perfil, donde viven los ajustes
              que dependen de quién es: entre ellos el modo de cobro. */}
          <Link
            href="/perfil"
            className={cn(
              'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 transition-colors',
              rutaActual === '/perfil' ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]',
            )}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-borde bg-superficie-suave text-xs font-semibold text-marca-300">
              {iniciales || '··'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-tinta">
                {sesion?.usuario.nombre} {sesion?.usuario.apellido}
              </span>
              <span className="block truncate text-[11px] text-marca-400">
                {sesion?.usuario.rol}
              </span>
            </span>
          </Link>
          <Tooltip texto="Cerrar sesión">
            <button
              onClick={cerrarSesion}
              aria-label="Cerrar sesión"
              className="grid size-8 place-items-center rounded-lg text-tinta-tenue transition-colors hover:bg-peligro/15 hover:text-peligro"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </Tooltip>
        </div>
      </div>
    </>
  );
}

function ElementoModulo({
  modulo,
  rutaActual,
}: {
  modulo: ModuloAccesible;
  rutaActual: string;
}) {
  const Icono = modulo.icono;

  if (!modulo.implementado) {
    return (
      <Tooltip texto="Módulo en desarrollo">
        <span className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-tinta-tenue/60">
          <Icono className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{modulo.etiqueta}</span>
          <span className="ml-auto size-1.5 rounded-full bg-aviso/50" />
        </span>
      </Tooltip>
    );
  }

  return (
    <Enlace
      href={modulo.entrada}
      activo={rutaActual.startsWith(modulo.ruta)}
      icono={<Icono className="size-4 shrink-0" aria-hidden />}
      etiqueta={modulo.etiqueta}
    />
  );
}

function Enlace({
  href,
  activo,
  icono,
  etiqueta,
}: {
  href: string;
  activo: boolean;
  icono: React.ReactNode;
  etiqueta: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200',
        activo ? 'text-tinta' : 'text-tinta-suave hover:bg-white/[0.04] hover:text-tinta',
      )}
    >
      {activo && (
        <motion.span
          layoutId="navegacion-activa"
          transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          className="absolute inset-0 -z-10 rounded-xl border border-marca-500/25 bg-marca-500/10"
        />
      )}
      <span className={cn('transition-colors', activo && 'text-marca-400')}>{icono}</span>
      <span className="truncate">{etiqueta}</span>
      {activo && <span className="ml-auto size-1.5 rounded-full bg-marca-400" />}
    </Link>
  );
}
