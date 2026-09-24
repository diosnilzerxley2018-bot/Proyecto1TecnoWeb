'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Flame, Minus, Plus, ShoppingBasket } from 'lucide-react';
import { Tarjeta } from '@/components/ui/Tarjeta';
import { Insignia } from '@/components/ui/Insignia';
import { Boton } from '@/components/ui/Boton';
import type { ProductoCatalogo } from '@/types';
import { formatearBs } from '@/lib/formato';
import { cn } from '@/lib/cn';
import { urlImagenProducto } from '@/lib/imagenes';

/**
 * Producto del catálogo público.
 *
 * El control de cantidad aparece solo después de agregar: mostrar un selector
 * antes de que el cliente haya decidido nada añade una decisión que nadie
 * pidió tomar. Una vez en el carrito, sí conviene poder ajustar sin salir.
 */
export function TarjetaCatalogo({
  producto,
  indice,
  cantidadEnCarrito,
  onAgregar,
  onCambiarCantidad,
  onVerDetalle,
}: {
  producto: ProductoCatalogo;
  indice: number;
  cantidadEnCarrito: number;
  onAgregar: () => void;
  onCambiarCantidad: (cantidad: number) => void;
  onVerDetalle: () => void;
}) {
  const [recienAgregado, setRecienAgregado] = useState(false);
  const agotado = !producto.disponible;
  const enCarrito = cantidadEnCarrito > 0;
  const topeAlcanzado = cantidadEnCarrito >= producto.stockDisponible;
  const urlFoto = urlImagenProducto(producto.id, producto.imagenActualizadaEn);

  function agregar() {
    onAgregar();
    setRecienAgregado(true);
    setTimeout(() => setRecienAgregado(false), 1200);
  }

  return (
    <Tarjeta
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.32, delay: Math.min(indice * 0.04, 0.3), ease: 'easeOut' }}
      className={cn('group flex flex-col overflow-hidden', agotado && 'opacity-60')}
    >
      <button
        onClick={onVerDetalle}
        className="relative h-28 w-full shrink-0 overflow-hidden text-left"
        aria-label={`Ver detalle de ${producto.nombre}`}
      >
        {urlFoto ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urlFoto}
              alt=""
              className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
          </>
        ) : (
          <>
            {/* Sin foto: el color de la categoría da identidad visual a la tarjeta. */}
            <div className="absolute inset-0 bg-gradient-to-br from-marca-500/25 via-info/10 to-transparent transition-transform duration-500 group-hover:scale-105" />
            <div
              className="absolute inset-0 opacity-30"
              aria-hidden
              style={{
                backgroundImage:
                  'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.12) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />
          </>
        )}
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
          <span className="rounded-lg vidrio px-2 py-1 text-[10px] uppercase tracking-wider text-tinta-suave">
            {producto.categoria.nombre}
          </span>
          {producto.valorNutricional && (
            <Insignia tono="aviso">
              <Flame className="size-3" aria-hidden />
              {producto.valorNutricional.calorias} kcal
            </Insignia>
          )}
        </div>
      </button>

      <div className="flex flex-1 flex-col p-4">
        <button onClick={onVerDetalle} className="text-left">
          <h3 className="font-medium text-tinta transition-colors group-hover:text-marca-300">
            {producto.nombre}
          </h3>
          <p className="mt-1.5 line-clamp-2 min-h-8 text-xs leading-relaxed text-tinta-tenue">
            {producto.descripcion ?? 'Sin descripción'}
          </p>
        </button>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-lg font-semibold tabular-nums leading-none text-tinta">
              {formatearBs(producto.precio)}
            </p>
            <p className="mt-1.5 text-[11px] text-tinta-tenue">
              {agotado ? 'Agotado' : `${producto.stockDisponible} disponibles`}
            </p>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {agotado ? (
              <Insignia key="agotado" tono="peligro">
                Sin stock
              </Insignia>
            ) : enCarrito ? (
              <motion.div
                key="cantidad"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-1 rounded-xl border border-marca-500/30 bg-marca-500/10 p-1"
              >
                <BotonCantidad
                  etiqueta="Quitar una unidad"
                  onClick={() => onCambiarCantidad(cantidadEnCarrito - 1)}
                >
                  <Minus className="size-3.5" aria-hidden />
                </BotonCantidad>
                <span className="w-6 text-center text-sm tabular-nums text-marca-300">
                  {cantidadEnCarrito}
                </span>
                <BotonCantidad
                  etiqueta="Agregar una unidad"
                  deshabilitado={topeAlcanzado}
                  onClick={() => onCambiarCantidad(cantidadEnCarrito + 1)}
                >
                  <Plus className="size-3.5" aria-hidden />
                </BotonCantidad>
              </motion.div>
            ) : (
              <motion.div
                key="agregar"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <Boton
                  variante={recienAgregado ? 'contorno' : 'primario'}
                  tamano="sm"
                  onClick={agregar}
                  icono={
                    recienAgregado ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : (
                      <ShoppingBasket className="size-3.5" aria-hidden />
                    )
                  }
                >
                  {recienAgregado ? 'Agregado' : 'Agregar'}
                </Boton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Tarjeta>
  );
}

function BotonCantidad({
  children,
  etiqueta,
  onClick,
  deshabilitado = false,
}: {
  children: React.ReactNode;
  etiqueta: string;
  onClick: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      whileTap={{ scale: 0.88 }}
      className="grid size-7 place-items-center rounded-lg text-marca-300 transition-colors hover:bg-marca-500/20 disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </motion.button>
  );
}
