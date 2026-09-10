'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { Boton } from '@/components/ui/Boton';
import type { SugerenciaRepartidor } from '@/types';

/**
 * RF-PED-07 — a quién conviene asignarle el pedido.
 *
 * **Sugiere, no asigna.** El sistema propone al repartidor de turno con menos
 * entregas en curso, que es un criterio equitativo y explicable, pero la
 * decisión sigue siendo de quien gestiona: un pedido a tres cuadras conviene
 * dárselo a quien ya sale para allá, aunque tenga una entrega más. Eso el
 * sistema no lo sabe.
 *
 * Muestra siempre el **motivo** de la propuesta. Una sugerencia sin explicación
 * es una orden disfrazada: quien la lee no puede juzgar si conviene seguirla.
 */
export function SugerenciaReparto({
  idPedido,
  onAceptar,
}: {
  idPedido: number;
  onAceptar: (idRepartidor: number) => Promise<void> | void;
}) {
  const [sugerencia, setSugerencia] = useState<SugerenciaRepartidor | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aceptando, setAceptando] = useState(false);

  const consultar = useCallback(async () => {
    setCargando(true);
    try {
      setSugerencia(
        await api.get<SugerenciaRepartidor>(`/gestion/pedidos/${idPedido}/sugerencia-repartidor`),
      );
    } catch (e) {
      // Quedarse sin sugerencia no impide asignar a mano: el desplegable de
      // abajo sigue estando. Se calla en vez de estorbar con un error.
      if (!(e instanceof ErrorApi)) throw e;
      setSugerencia(null);
    } finally {
      setCargando(false);
    }
  }, [idPedido]);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  if (cargando || !sugerencia) return null;

  const { sugerido, motivo } = sugerencia;

  /* Nadie de turno. No es un error: es una situación normal de la operación. */
  if (!sugerido) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-aviso/25 bg-aviso/10 px-3.5 py-2.5 text-xs leading-relaxed text-aviso">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{motivo}. Puede asignarlo a mano de todos modos.</span>
      </p>
    );
  }

  async function aceptar() {
    if (!sugerido) return;
    setAceptando(true);
    try {
      await onAceptar(sugerido.id);
      await consultar();
    } finally {
      setAceptando(false);
    }
  }

  return (
    <AnimatePresence initial={false}>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-marca-500/30 bg-marca-500/[0.07] p-3.5"
      >
        <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-marca-300">
          <Sparkles className="size-3" aria-hidden />
          Sugerencia
        </p>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-tinta">{sugerido.nombreCompleto}</p>
            <p className="mt-0.5 text-[11px] text-tinta-tenue">{motivo}</p>
          </div>

          <Boton
            variante="primario"
            tamano="sm"
            cargando={aceptando}
            onClick={aceptar}
            icono={<CircleCheck className="size-3.5" aria-hidden />}
          >
            Asignar
          </Boton>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
