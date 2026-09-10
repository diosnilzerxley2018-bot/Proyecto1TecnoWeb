'use client';

import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Baby, Check, GraduationCap, Moon, Palette, Sun, SunMoon, UserRound } from 'lucide-react';
import { useTema, type PreferenciaModo, type Tema } from '@/context/TemaContext';
import { useCierreAlPulsarFuera, useMenuFlotante } from './usarMenuFlotante';
import { cn } from '@/lib/cn';

const TEMAS: { valor: Tema; etiqueta: string; icono: typeof Baby; muestra: string }[] = [
  { valor: 'ninos', etiqueta: 'Niños', icono: Baby, muestra: 'bg-orange-400' },
  { valor: 'jovenes', etiqueta: 'Jóvenes', icono: GraduationCap, muestra: 'bg-emerald-400' },
  { valor: 'adultos', etiqueta: 'Adultos', icono: UserRound, muestra: 'bg-blue-400' },
];

const MODOS: { valor: PreferenciaModo; etiqueta: string; icono: typeof Sun }[] = [
  { valor: 'auto', etiqueta: 'Automático', icono: SunMoon },
  { valor: 'dia', etiqueta: 'Día', icono: Sun },
  { valor: 'noche', etiqueta: 'Noche', icono: Moon },
];

const ANCHO = 240;

/**
 * RF-WEB-02 — selección de tema visual y de modo día / noche.
 *
 * El menú se dibuja en un portal: colocado en el flujo quedaba recortado por
 * la barra lateral, que lo cortaba justo donde empiezan las opciones de modo.
 */
export function SelectorTema({ compacto = false }: { compacto?: boolean }) {
  const { tema, preferencia, modo, cambiarTema, cambiarPreferencia } = useTema();
  const [abierto, setAbierto] = useState(false);

  const { disparador, menu, estilo } = useMenuFlotante({
    abierto,
    alineacion: 'derecha',
    anchoFijo: ANCHO,
    altoDeseado: 400,
  });

  const cerrar = useCallback(() => setAbierto(false), []);
  useCierreAlPulsarFuera(abierto, cerrar, disparador, menu);

  const panel = abierto && estilo && (
    <motion.div
      ref={menu as React.RefObject<HTMLDivElement>}
      role="dialog"
      aria-label="Apariencia del sitio"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      style={estilo}
      className="z-200 overflow-y-auto overscroll-contain rounded-xl p-3 vidrio shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]"
    >
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
        Tema visual
      </p>
      <div className="mb-4 space-y-1">
        {TEMAS.map((opcion) => {
          const Icono = opcion.icono;
          const elegido = tema === opcion.valor;

          return (
            <button
              key={opcion.valor}
              onClick={() => cambiarTema(opcion.valor)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                elegido ? 'bg-white/[0.06] text-tinta' : 'text-tinta-suave hover:bg-white/[0.04]',
              )}
            >
              <Icono className="size-4 shrink-0" aria-hidden />
              <span className="flex-1 text-left">{opcion.etiqueta}</span>
              <span className={cn('size-3 rounded-full', opcion.muestra)} aria-hidden />
              {elegido && <Check className="size-3.5 text-marca-400" aria-hidden />}
            </button>
          );
        })}
      </div>

      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
        Modo
      </p>
      <div className="space-y-1">
        {MODOS.map((opcion) => {
          const Icono = opcion.icono;
          const elegido = preferencia === opcion.valor;

          return (
            <button
              key={opcion.valor}
              onClick={() => cambiarPreferencia(opcion.valor)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                elegido ? 'bg-white/[0.06] text-tinta' : 'text-tinta-suave hover:bg-white/[0.04]',
              )}
            >
              <Icono className="size-4 shrink-0" aria-hidden />
              <span className="flex-1 text-left">{opcion.etiqueta}</span>
              {elegido && <Check className="size-3.5 text-marca-400" aria-hidden />}
            </button>
          );
        })}
      </div>

      {preferencia === 'auto' && (
        <p className="mt-3 border-t border-borde pt-2.5 text-[11px] leading-snug text-tinta-tenue">
          Según su hora local son las {new Date().getHours()}:00, así que el sitio se muestra en
          modo {modo === 'dia' ? 'día' : 'noche'}.
        </p>
      )}
    </motion.div>
  );

  return (
    <>
      <button
        ref={disparador}
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label="Cambiar apariencia del sitio"
        className={cn(
          'flex items-center gap-2 rounded-xl border text-sm transition-colors duration-200',
          compacto ? 'size-9 justify-center' : 'px-3 py-2',
          abierto
            ? 'border-marca-500/40 bg-marca-500/10 text-marca-300'
            : 'border-borde text-tinta-suave hover:border-borde-fuerte hover:text-tinta',
        )}
      >
        <Palette className="size-4 shrink-0" aria-hidden />
        {!compacto && <span className="hidden sm:inline">Apariencia</span>}
      </button>

      {typeof document !== 'undefined' &&
        createPortal(<AnimatePresence>{panel}</AnimatePresence>, document.body)}
    </>
  );
}
