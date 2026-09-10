'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tipo = 'exito' | 'error' | 'info';

interface Notificacion {
  id: number;
  tipo: Tipo;
  mensaje: string;
}

const ESTILOS: Record<Tipo, { icono: React.ReactNode; barra: string; texto: string }> = {
  exito: {
    icono: <CheckCircle2 className="size-4" aria-hidden />,
    barra: 'bg-marca-400',
    texto: 'text-marca-300',
  },
  error: {
    icono: <AlertTriangle className="size-4" aria-hidden />,
    barra: 'bg-peligro',
    texto: 'text-peligro',
  },
  info: {
    icono: <Info className="size-4" aria-hidden />,
    barra: 'bg-info',
    texto: 'text-info',
  },
};

const DURACION_MS = 4500;

interface Contexto {
  notificar: (tipo: Tipo, mensaje: string) => void;
}

const ContextoNotificaciones = createContext<Contexto | null>(null);

/**
 * Avisos efímeros de resultado.
 *
 * Cada operación que cambia datos debe dejar rastro visible: sin confirmación,
 * el usuario no sabe si su acción llegó a ejecutarse.
 */
export function ProveedorNotificaciones({ children }: { children: React.ReactNode }) {
  const [lista, setLista] = useState<Notificacion[]>([]);

  const descartar = useCallback((id: number) => {
    setLista((actuales) => actuales.filter((n) => n.id !== id));
  }, []);

  const notificar = useCallback(
    (tipo: Tipo, mensaje: string) => {
      const id = Date.now() + Math.random();
      setLista((actuales) => [...actuales, { id, tipo, mensaje }]);
      setTimeout(() => descartar(id), DURACION_MS);
    },
    [descartar],
  );

  const valor = useMemo(() => ({ notificar }), [notificar]);

  return (
    <ContextoNotificaciones.Provider value={valor}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            aria-live="polite"
            className="pointer-events-none fixed bottom-4 right-4 z-200 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
          >
            <AnimatePresence initial={false}>
              {lista.map((n) => (
                <Aviso key={n.id} notificacion={n} onCerrar={() => descartar(n.id)} />
              ))}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </ContextoNotificaciones.Provider>
  );
}

function Aviso({
  notificacion,
  onCerrar,
}: {
  notificacion: Notificacion;
  onCerrar: () => void;
}) {
  const estilo = ESTILOS[notificacion.tipo];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="pointer-events-auto relative overflow-hidden rounded-xl vidrio shadow-[0_20px_50px_-20px_rgba(0,0,0,0.95)]"
    >
      <div className="flex items-start gap-3 px-4 py-3.5 pr-10">
        <span className={cn('mt-0.5 shrink-0', estilo.texto)}>{estilo.icono}</span>
        <p className="text-sm leading-snug text-tinta">{notificacion.mensaje}</p>
      </div>

      <button
        onClick={onCerrar}
        aria-label="Descartar aviso"
        className="absolute right-2 top-2.5 grid size-6 place-items-center rounded-md text-tinta-tenue transition-colors hover:bg-white/5 hover:text-tinta"
      >
        <X className="size-3.5" aria-hidden />
      </button>

      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: DURACION_MS / 1000, ease: 'linear' }}
        className={cn('absolute bottom-0 left-0 h-0.5 w-full origin-left', estilo.barra)}
      />
    </motion.div>
  );
}

export function useNotificaciones(): Contexto {
  const contexto = useContext(ContextoNotificaciones);
  if (!contexto) {
    throw new Error('useNotificaciones debe usarse dentro de ProveedorNotificaciones');
  }
  return contexto;
}
