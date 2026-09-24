'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Package, Pencil, Snowflake, Sun, TriangleAlert, Warehouse } from 'lucide-react';
import { PanelLateral } from '@/components/ui/Dialogo';
import { ChipsFiltro } from '@/components/ui/ChipsFiltro';
import { Insignia } from '@/components/ui/Insignia';
import { Boton } from '@/components/ui/Boton';
import { FormularioProducto } from './FormularioProducto';
import { cn } from '@/lib/cn';
import { PanelNutricion } from './PanelNutricion';
import { PanelRecetas } from './PanelRecetas';
import { PanelFoto } from './PanelFoto';
import type { Producto } from '@/types';
import { formatearBs, formatearCantidad } from '@/lib/formato';
import { urlImagenProducto } from '@/lib/imagenes';

type Seccion = 'ficha' | 'foto' | 'nutricion' | 'recetas';

/** Detalle de un producto: su ficha, su información nutricional y sus recetas. */
export function PanelProducto({
  producto,
  puedeGestionar,
  onCerrar,
  onCambio,
}: {
  producto: Producto | null;
  puedeGestionar: boolean;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const [seccion, setSeccion] = useState<Seccion>('ficha');
  const [editando, setEditando] = useState(false);

  if (!producto) return null;

  return (
    <PanelLateral
      abierto
      onCerrar={onCerrar}
      titulo={producto.nombre}
      descripcion={producto.categoria.nombre}
    >
      <div className="space-y-6">
        <ChipsFiltro<Seccion>
          idGrupo="seccion-producto"
          valor={seccion}
          onCambiar={(valor) => {
            setSeccion(valor);
            setEditando(false);
          }}
          opciones={[
            { valor: 'ficha', etiqueta: 'Ficha' },
            { valor: 'foto', etiqueta: 'Foto' },
            { valor: 'nutricion', etiqueta: 'Nutrición' },
            { valor: 'recetas', etiqueta: 'Recetas' },
          ]}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={`${seccion}-${editando}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {seccion === 'ficha' &&
              (editando ? (
                <FormularioProducto
                  producto={producto}
                  onCancelar={() => setEditando(false)}
                  onListo={() => {
                    setEditando(false);
                    onCambio();
                  }}
                />
              ) : (
                <Ficha
                  producto={producto}
                  puedeGestionar={puedeGestionar}
                  onEditar={() => setEditando(true)}
                />
              ))}

            {seccion === 'foto' && (
              <PanelFoto producto={producto} puedeGestionar={puedeGestionar} onGuardado={onCambio} />
            )}

            {seccion === 'nutricion' && (
              <PanelNutricion
                producto={producto}
                puedeGestionar={puedeGestionar}
                onGuardado={onCambio}
              />
            )}

            {seccion === 'recetas' && (
              <PanelRecetas producto={producto} puedeGestionar={puedeGestionar} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </PanelLateral>
  );
}

function Ficha({
  producto,
  puedeGestionar,
  onEditar,
}: {
  producto: Producto;
  puedeGestionar: boolean;
  onEditar: () => void;
}) {
  const frio = producto.tipoConservacion === 'Refrigerado';
  const urlFoto = urlImagenProducto(producto.id, producto.imagenActualizadaEn);

  return (
    <div className="space-y-6">
      {urlFoto && (
        <div className="overflow-hidden rounded-2xl border border-borde">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urlFoto} alt={producto.nombre} className="aspect-video w-full object-cover" />
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-2xl font-semibold tabular-nums leading-none text-marca-300">
            {formatearBs(producto.precio)}
          </p>
          {producto.costoPromedio !== null && (
            <p
              className={cn(
                'mt-1.5 flex items-center gap-1.5 text-[11px] tabular-nums',
                producto.vendeBajoCosto ? 'text-peligro' : 'text-tinta-tenue',
              )}
            >
              {producto.vendeBajoCosto && <TriangleAlert className="size-3" aria-hidden />}
              Cuesta {formatearBs(producto.costoPromedio)}
              {producto.vendeBajoCosto
                ? ' · se está vendiendo por debajo del costo'
                : ` · margen ${formatearBs(producto.precio - producto.costoPromedio)}`}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Insignia tono={producto.activo ? 'marca' : 'neutro'}>
              {producto.activo ? 'Activo' : 'Dado de baja'}
            </Insignia>
            <Insignia tono={frio ? 'info' : 'aviso'}>
              {frio ? (
                <Snowflake className="size-3" aria-hidden />
              ) : (
                <Sun className="size-3" aria-hidden />
              )}
              {producto.tipoConservacion}
            </Insignia>
            <Insignia tono="neutro">{producto.categoria.nombre}</Insignia>
          </div>
        </div>

        {puedeGestionar && (
          <Boton
            variante="secundario"
            tamano="sm"
            onClick={onEditar}
            icono={<Pencil className="size-3.5" aria-hidden />}
          >
            Editar
          </Boton>
        )}
      </div>

      <section>
        <Titulo>Descripción</Titulo>
        <p className="text-sm leading-relaxed text-tinta-suave">
          {producto.descripcion ?? (
            <span className="text-tinta-tenue">Sin descripción registrada</span>
          )}
        </p>
      </section>

      <section>
        <Titulo>Existencias</Titulo>
        {producto.existencias.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-borde bg-white/[0.02] px-3.5 py-3 text-sm text-tinta-tenue">
            <Package className="size-4 shrink-0" aria-hidden />
            Sin existencias en ningún almacén
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm text-tinta">
              <span className="text-lg font-semibold tabular-nums">
                {formatearCantidad(producto.stockTotal)}
              </span>{' '}
              <span className="text-tinta-tenue">unidades en total</span>
            </p>
            <ul className="space-y-1.5">
              {producto.existencias.map((existencia) => (
                <li
                  key={existencia.idAlmacen}
                  className="flex items-center justify-between rounded-xl border border-borde bg-white/[0.02] px-3.5 py-2.5"
                >
                  <span className="flex items-center gap-2 text-sm text-tinta-suave">
                    <Warehouse className="size-3.5 text-tinta-tenue" aria-hidden />
                    {existencia.almacen}
                  </span>
                  <span className="text-sm tabular-nums text-tinta">
                    {formatearCantidad(existencia.stock)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
      {children}
    </h3>
  );
}
