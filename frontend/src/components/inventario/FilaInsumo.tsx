'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, Pencil, Snowflake, Sun, Trash2 } from 'lucide-react';
import { Insignia } from '@/components/ui/Insignia';
import { Boton } from '@/components/ui/Boton';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Insumo } from '@/types';
import { formatearBs, formatearCantidad } from '@/lib/formato';
import { cn } from '@/lib/cn';

/**
 * Una fila del listado de insumos.
 *
 * En pantallas anchas se comporta como fila de tabla; por debajo de `md` los
 * datos se apilan, porque una tabla de siete columnas en un teléfono obliga a
 * desplazamiento horizontal y vuelve la información ilegible.
 */
export function FilaInsumo({
  insumo,
  indice,
  puedeGestionar,
  onEditar,
  onEliminar,
}: {
  insumo: Insumo;
  indice: number;
  puedeGestionar: boolean;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const bajoMinimo = insumo.stockTotal <= insumo.stockMinimo;
  const frio = insumo.tipoConservacion === 'Refrigerado';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.26, delay: Math.min(indice * 0.03, 0.25), ease: 'easeOut' }}
      className={cn(
        'group grid gap-3 px-4 py-3.5 transition-colors duration-200 hover:bg-white/[0.025]',
        'md:grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))_auto] md:items-center',
        !insumo.activo && 'opacity-55',
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg border',
            frio ? 'border-info/25 bg-info/10 text-info' : 'border-aviso/25 bg-aviso/10 text-aviso',
          )}
          title={insumo.tipoConservacion}
        >
          {frio ? <Snowflake className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-tinta">{insumo.nombre}</p>
          <p className="mt-0.5 text-[11px] text-tinta-tenue">
            {insumo.unidad.nombre} ({insumo.unidad.abreviatura})
            {!insumo.activo && ' · dado de baja'}
          </p>
        </div>
      </div>

      <Celda etiqueta="Costo">
        <span className="tabular-nums">{formatearBs(insumo.costoUnitario)}</span>
      </Celda>

      <Celda etiqueta="Mínimo">
        <span className="tabular-nums text-tinta-suave">
          {insumo.stockMinimo} {insumo.unidad.abreviatura}
        </span>
      </Celda>

      <Celda etiqueta="Existencias">
        <div className="flex items-center gap-2">
          <span className={cn('tabular-nums', bajoMinimo ? 'text-aviso' : 'text-tinta')}>
            {formatearCantidad(insumo.stockTotal)} {insumo.unidad.abreviatura}
          </span>
          {bajoMinimo && (
            <Tooltip texto="Alcanzó o descendió bajo su stock mínimo">
              <Insignia tono="aviso">
                <AlertTriangle className="size-3" aria-hidden />
                Reponer
              </Insignia>
            </Tooltip>
          )}
        </div>
        {insumo.existencias.length > 0 && (
          <p className="mt-1 truncate text-[11px] text-tinta-tenue">
            {insumo.existencias
              .map((e) => `${e.almacen}: ${formatearCantidad(e.stock)}`)
              .join(' · ')}
          </p>
        )}
      </Celda>

      {puedeGestionar && (
        <div className="flex gap-1 md:opacity-0 md:transition-opacity md:duration-200 md:group-hover:opacity-100 md:focus-within:opacity-100">
          <Tooltip texto="Editar">
            <Boton tamano="icono" variante="fantasma" onClick={onEditar} aria-label="Editar insumo">
              <Pencil className="size-4" aria-hidden />
            </Boton>
          </Tooltip>
          <Tooltip texto="Eliminar">
            <Boton
              tamano="icono"
              variante="fantasma"
              onClick={onEliminar}
              aria-label="Eliminar insumo"
              className="hover:bg-peligro/15 hover:text-peligro"
            >
              <Trash2 className="size-4" aria-hidden />
            </Boton>
          </Tooltip>
        </div>
      )}
    </motion.li>
  );
}

/** En móvil cada dato lleva su etiqueta; en escritorio la aporta la cabecera. */
function Celda({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 text-sm">
      <span className="mr-2 text-[11px] uppercase tracking-wider text-tinta-tenue md:hidden">
        {etiqueta}
      </span>
      {children}
    </div>
  );
}
