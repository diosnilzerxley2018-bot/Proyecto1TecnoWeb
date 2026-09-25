'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Boxes, CalendarClock, Package, Plus, Trash2 } from 'lucide-react';
import { Campo } from '@/components/ui/Campo';
import { Selector, type Opcion } from '@/components/ui/Selector';
import { Boton } from '@/components/ui/Boton';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Almacen, TipoItem } from '@/types';
import { formatearBs } from '@/lib/formato';
import { PASO_CANTIDAD } from '@/lib/dominio';

/** Un ítem que puede moverse: insumo o producto terminado. */
export interface ItemMovible {
  clave: string;
  tipo: TipoItem;
  id: number;
  nombre: string;
  unidad: string;
  /** Costo de referencia, para prellenar el ingreso. */
  costoSugerido: number;
  /** Los perecederos exigen lote y vencimiento al ingresar (hallazgo A6). */
  controlaVencimiento: boolean;
}

export interface Linea {
  /** Identificador local; no viaja al servidor. */
  uid: string;
  clave: string | null;
  idAlmacen: number | null;
  cantidad: string;
  costoUnitario: string;
  codigoLote: string;
  fechaVencimiento: string;
}

export const lineaVacia = (): Linea => ({
  uid: Math.random().toString(36).slice(2),
  clave: null,
  idAlmacen: null,
  cantidad: '',
  costoUnitario: '',
  codigoLote: '',
  fechaVencimiento: '',
});

/**
 * Editor de las líneas de una nota de inventario.
 *
 * Insumos y productos se ofrecen en un mismo selector en lugar de pedir primero
 * el tipo: son cinco controles por línea y en un teléfono eso ya no cabe. El
 * tipo se deduce del ítem elegido, que es lo que el servidor necesita para
 * separarlos en las dos listas del cuerpo.
 *
 * Los productos terminados se cuentan en unidades enteras y los insumos admiten
 * dos decimales, tal como declara el esquema; el paso del campo se ajusta al
 * ítem seleccionado.
 */
export function EditorLineas({
  lineas,
  items,
  almacenes,
  conCosto,
  onCambiar,
}: {
  lineas: Linea[];
  items: ItemMovible[];
  almacenes: Almacen[];
  conCosto: boolean;
  onCambiar: (lineas: Linea[]) => void;
}) {
  const porClave = new Map(items.map((i) => [i.clave, i]));

  const opcionesItem: Opcion<string>[] = items.map((item) => ({
    valor: item.clave,
    etiqueta: item.nombre,
    descripcion: `${item.tipo === 'insumo' ? 'Insumo' : 'Producto'} · ${item.unidad}`,
  }));

  const opcionesAlmacen: Opcion<number>[] = almacenes.map((a) => ({
    valor: a.id,
    etiqueta: a.nombre,
    descripcion: a.tipoConservacion,
  }));

  function actualizar(uid: string, cambios: Partial<Linea>) {
    onCambiar(lineas.map((l) => (l.uid === uid ? { ...l, ...cambios } : l)));
  }

  function elegirItem(uid: string, clave: string) {
    const item = porClave.get(clave);
    actualizar(uid, {
      clave,
      // El costo de referencia del insumo ahorra teclear lo habitual.
      costoUnitario: conCosto && item ? String(item.costoSugerido) : '',
    });
  }

  const total = lineas.reduce((suma, l) => {
    const cantidad = Number(l.cantidad || 0);
    const costo = Number(l.costoUnitario || 0);
    return suma + cantidad * costo;
  }, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
          Detalle de la nota
        </h3>
        <Boton
          type="button"
          tamano="sm"
          variante="contorno"
          onClick={() => onCambiar([...lineas, lineaVacia()])}
          icono={<Plus className="size-3.5" aria-hidden />}
        >
          Agregar línea
        </Boton>
      </div>

      <ul className="space-y-2.5">
        <AnimatePresence initial={false}>
          {lineas.map((linea) => {
            const item = linea.clave ? porClave.get(linea.clave) : null;
            const entero = item?.tipo === 'producto';

            return (
              <motion.li
                key={linea.uid}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-borde bg-white/[0.02] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] text-tinta-tenue">
                      {item ? (
                        <>
                          {item.tipo === 'insumo' ? (
                            <Boxes className="size-3.5 text-info" aria-hidden />
                          ) : (
                            <Package className="size-3.5 text-marca-400" aria-hidden />
                          )}
                          {item.tipo === 'insumo' ? 'Insumo' : 'Producto terminado'}
                        </>
                      ) : (
                        'Línea sin ítem'
                      )}
                    </span>

                    <Tooltip texto="Quitar línea">
                      <Boton
                        type="button"
                        tamano="icono"
                        variante="fantasma"
                        aria-label="Quitar línea"
                        disabled={lineas.length === 1}
                        onClick={() => onCambiar(lineas.filter((l) => l.uid !== linea.uid))}
                        className="hover:bg-peligro/15 hover:text-peligro"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Boton>
                    </Tooltip>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <Selector<string>
                      etiqueta="Ítem"
                      className="sm:col-span-2"
                      valor={linea.clave}
                      opciones={opcionesItem}
                      onCambiar={(clave) => elegirItem(linea.uid, clave)}
                      marcador="Elija un insumo o producto"
                    />

                    <Selector<number>
                      etiqueta="Almacén"
                      valor={linea.idAlmacen}
                      opciones={opcionesAlmacen}
                      onCambiar={(valor) => actualizar(linea.uid, { idAlmacen: valor })}
                    />

                    <Campo
                      etiqueta="Cantidad"
                      type="number"
                      min={entero ? '1' : PASO_CANTIDAD}
                      step={entero ? '1' : PASO_CANTIDAD}
                      value={linea.cantidad}
                      onChange={(e) => actualizar(linea.uid, { cantidad: e.target.value })}
                      sufijo={item?.unidad}
                      ayuda={entero ? 'Solo unidades enteras' : undefined}
                    />

                    {conCosto && (
                      <Campo
                        etiqueta="Precio pagado por unidad"
                        className="sm:col-span-2"
                        type="number"
                        min="0"
                        step="0.01"
                        value={linea.costoUnitario}
                        onChange={(e) => actualizar(linea.uid, { costoUnitario: e.target.value })}
                        sufijo="Bs"
                        ayuda="Lo que costó en esta compra. Recalcula el costo promedio del insumo"
                      />
                    )}

                    {/* El lote solo se pide donde aporta: al ingresar un
                        insumo perecedero. El servidor rechaza la nota si falta. */}
                    {conCosto && item?.controlaVencimiento && (
                      <div className="grid gap-2.5 sm:col-span-2 sm:grid-cols-2">
                        <div className="flex items-start gap-2 rounded-xl border border-info/25 bg-info/[0.06] px-3 py-2.5 text-[11px] leading-snug text-info sm:col-span-2">
                          <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          Insumo perecedero: su vencimiento es obligatorio y el consumo saldrá
                          primero del lote que caduque antes.
                        </div>
                        <Campo
                          etiqueta="Código de lote"
                          maxLength={50}
                          value={linea.codigoLote}
                          onChange={(e) => actualizar(linea.uid, { codigoLote: e.target.value })}
                          ayuda="Opcional"
                        />
                        <Campo
                          etiqueta="Fecha de vencimiento"
                          type="date"
                          required
                          value={linea.fechaVencimiento}
                          onChange={(e) =>
                            actualizar(linea.uid, { fechaVencimiento: e.target.value })
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {conCosto && (
        <div className="flex items-center justify-between rounded-xl bg-marca-500/8 px-3.5 py-3">
          <span className="text-sm text-tinta-suave">Total de la nota</span>
          <motion.span
            key={total}
            initial={{ opacity: 0.5, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-lg font-semibold tabular-nums text-marca-300"
          >
            {formatearBs(total)}
          </motion.span>
        </div>
      )}
    </div>
  );
}
