'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, Search, ShoppingBasket, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { BusquedaSitio, ResultadoBusqueda } from '@/types';

/**
 * RF-PED-03 — *"buscar productos e información del negocio desde el encabezado
 * de la página principal"*.
 *
 * Una sola caja para las dos cosas, porque el cliente no sabe de antemano si lo
 * que busca es un producto o un dato: escribe «avena» o escribe «horario» y el
 * sistema decide qué le está preguntando.
 *
 * Los resultados llevan a dos sitios distintos: un producto abre el catálogo
 * filtrado por su nombre; un dato del negocio abre la página de información.
 */

/** Espera antes de consultar. Sin esto se dispara una petición por tecla. */
const ESPERA_MS = 300;

export function BuscadorSitio() {
  const router = useRouter();
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const limpio = termino.trim();
    if (limpio === '') {
      setResultados([]);
      return;
    }

    // Cada pulsación cancela la consulta anterior: si no, una respuesta lenta
    // podría llegar después de otra más nueva y pisar sus resultados.
    let vigente = true;
    const temporizador = setTimeout(() => {
      api
        .get<BusquedaSitio>(`/negocio/buscar?termino=${encodeURIComponent(limpio)}`)
        .then((r) => {
          if (vigente) setResultados(r.resultados);
        })
        .catch(() => {
          // Un buscador que no encuentra no debe interrumpir la navegación.
          if (vigente) setResultados([]);
        });
    }, ESPERA_MS);

    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [termino]);

  // Cerrar al tocar fuera: el panel tapa el contenido y no tiene botón propio.
  useEffect(() => {
    if (!abierto) return;

    const alTocarFuera = (evento: MouseEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alTocarFuera);
    return () => document.removeEventListener('mousedown', alTocarFuera);
  }, [abierto]);

  function ir(resultado: ResultadoBusqueda) {
    setAbierto(false);
    setTermino('');

    if (resultado.tipo === 'producto') {
      router.push(`/portal?termino=${encodeURIComponent(resultado.titulo)}`);
    } else {
      router.push('/portal/nosotros');
    }
  }

  const hayPanel = abierto && termino.trim() !== '';

  return (
    <div ref={contenedor} className="relative min-w-0 flex-1 sm:max-w-sm">
      <label className="sr-only" htmlFor="buscador-sitio">
        Buscar productos e información
      </label>

      <div className="flex items-center gap-2 rounded-xl border border-borde bg-superficie/60 px-3 py-2 transition-colors focus-within:border-marca-500/50">
        <Search className="size-4 shrink-0 text-tinta-tenue" aria-hidden />
        <input
          id="buscador-sitio"
          type="search"
          value={termino}
          onChange={(e) => {
            setTermino(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          placeholder="Buscar productos o información"
          className="min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta-tenue"
        />
        {termino !== '' && (
          <button
            type="button"
            onClick={() => setTermino('')}
            aria-label="Borrar la búsqueda"
            className="shrink-0 text-tinta-tenue transition-colors hover:text-tinta"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <AnimatePresence>
        {hayPanel && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-borde bg-superficie shadow-xl"
          >
            {resultados.length === 0 ? (
              <p className="px-4 py-3 text-sm text-tinta-tenue">
                Nada coincide con «{termino.trim()}».
              </p>
            ) : (
              <ul className="max-h-80 divide-y divide-borde overflow-y-auto">
                {resultados.map((r) => (
                  <li key={`${r.tipo}-${r.idProducto ?? r.titulo}`}>
                    <button
                      type="button"
                      onClick={() => ir(r)}
                      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-marca-500/8"
                    >
                      <span
                        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${
                          r.tipo === 'producto'
                            ? 'bg-marca-500/12 text-marca-300'
                            : 'bg-borde/60 text-tinta-tenue'
                        }`}
                      >
                        {r.tipo === 'producto' ? (
                          <ShoppingBasket className="size-3.5" aria-hidden />
                        ) : (
                          <Info className="size-3.5" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-tinta">{r.titulo}</span>
                        <span className="block truncate text-xs text-tinta-tenue">
                          {r.detalle}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
