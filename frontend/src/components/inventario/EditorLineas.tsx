'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Boxes, CalendarClock, Package, Plus, Trash2 } from 'lucide-react';
import { Campo } from '@/components/ui/Campo';
import { Selector, type Opcion } from '@/components/ui/Selector';
import { Boton } from '@/components/ui/Boton';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Almacen, TipoItem } from '@/types';
import { formatearBs, formatearCantidad } from '@/lib/formato';
import { DECIMALES_CANTIDAD, PASO_CANTIDAD } from '@/lib/dominio';
import { cn } from '@/lib/cn';

/** Un ítem que puede moverse: insumo o producto terminado. */
export interface ItemMovible {
  clave: string;
  tipo: TipoItem;
  id: number;
  nombre: string;
  /** Abreviatura, junto a las cantidades: «kg». */
  unidad: string;
  /** Nombre, para leer el costo: «por kilogramo», no «por kg» ni «por l». */
  nombreUnidad: string;
  /**
   * Costo de referencia, para prellenar el ingreso: el de catálogo del
   * insumo o el promedio del producto. Nulo si el producto nunca ingresó.
   */
  costoSugerido: number | null;
  /**
   * El costo promedio del producto no viene en el listado —sería una consulta
   * por producto— y se pide a su ficha al elegirlo. Hasta entonces, pendiente.
   */
  costoPendiente: boolean;
  /** Los perecederos exigen lote y vencimiento al ingresar (hallazgo A6). */
  controlaVencimiento: boolean;
  /** Solo entra en un almacén de su misma conservación (CU-INV-02). */
  tipoConservacion: string;
  /** Lo que hay en cada almacén: de dónde puede salir un egreso. */
  existencias: { idAlmacen: number; stock: number }[];
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

/** Una línea nueva. Hereda el almacén de la anterior: una compra suele ir entera al mismo. */
export const lineaVacia = (idAlmacen: number | null = null): Linea => ({
  uid: Math.random().toString(36).slice(2),
  clave: null,
  idAlmacen,
  cantidad: '',
  costoUnitario: '',
  codigoLote: '',
  fechaVencimiento: '',
});

/** Sin ítem ni cantidad: la línea que quedó de más, que se ignora al registrar. */
export const enBlanco = (linea: Linea) => !linea.clave && linea.cantidad.trim() === '';

/** Lo que hay del ítem en un almacén. */
export function disponibleEn(item: ItemMovible, idAlmacen: number): number {
  return item.existencias.find((e) => e.idAlmacen === idAlmacen)?.stock ?? 0;
}

/**
 * Los almacenes, según sirvan o no para el ítem de la línea.
 *
 * En un ingreso sirven los de su conservación: el servidor rechaza los demás
 * (CU-INV-02) y la nota volvía con un error que había que descifrar. En un
 * egreso, los que tienen existencias, con cuánto hay en cada uno: sacar de
 * donde no hay es el otro rechazo seguro (CU-INV-04). Los que no sirven se
 * muestran deshabilitados y con el porqué, para que no parezca que faltan.
 */
export function opcionesDeAlmacen(
  item: ItemMovible | null,
  almacenes: Almacen[],
  esIngreso: boolean,
): Opcion<number>[] {
  return almacenes.map((a) => {
    if (!item) return { valor: a.id, etiqueta: a.nombre, descripcion: a.tipoConservacion };

    if (esIngreso) {
      const apto = a.tipoConservacion === item.tipoConservacion;
      return {
        valor: a.id,
        etiqueta: a.nombre,
        descripcion: apto
          ? a.tipoConservacion
          : `${a.tipoConservacion} · no apto, el ítem va en ${item.tipoConservacion.toLowerCase()}`,
        deshabilitada: !apto,
      };
    }

    const hay = disponibleEn(item, a.id);
    return {
      valor: a.id,
      etiqueta: a.nombre,
      descripcion: hay > 0 ? `Hay ${formatearCantidad(hay)} ${item.unidad}` : 'Sin existencias',
      deshabilitada: hay <= 0,
    };
  });
}

/**
 * El almacén que se propone al elegir el ítem: el que ya tenía la línea si
 * sirve, o el único que sirve. En un ingreso, además, donde el ítem ya está
 * guardado —lo nuevo suele ir junto a lo que había— y si no está en ninguno,
 * el preferido de su conservación. En un egreso con existencias en varios
 * almacenes no se adivina: quien registra la merma sabe dónde ocurrió.
 */
function almacenPropuesto(
  item: ItemMovible,
  opciones: Opcion<number>[],
  almacenes: Almacen[],
  actual: number | null,
  esIngreso: boolean,
): number | null {
  const validos = opciones.filter((o) => !o.deshabilitada).map((o) => o.valor);
  if (actual !== null && validos.includes(actual)) return actual;
  if (validos.length === 1) return validos[0];
  if (!esIngreso) return null;

  const dondeEsta = item.existencias
    .filter((e) => e.stock > 0 && validos.includes(e.idAlmacen))
    .sort((a, b) => b.stock - a.stock)[0];
  if (dondeEsta) return dondeEsta.idAlmacen;
  return almacenes.find((a) => a.preferido && validos.includes(a.id))?.id ?? null;
}

export type CampoLinea = 'item' | 'almacen' | 'cantidad' | 'costo' | 'vencimiento';
export interface ProblemaLinea {
  campo: CampoLinea;
  mensaje: string;
}

/**
 * Qué le falta a cada línea para poder registrarse, y en qué campo.
 *
 * Una línea a medio llenar se descartaba sin aviso: se elegía el ítem, se
 * olvidaba el almacén y la nota se registraba sin esa línea. Ahora se señala.
 * En un egreso también se compara con lo que hay, sumando las líneas del
 * mismo ítem en el mismo almacén, como hace el servidor al consolidarlas.
 */
export function revisarLineas(
  lineas: Linea[],
  items: ItemMovible[],
  almacenes: Almacen[],
  esIngreso: boolean,
): Map<string, ProblemaLinea> {
  const porClave = new Map(items.map((i) => [i.clave, i]));
  const nombreAlmacen = new Map(almacenes.map((a) => [a.id, a.nombre]));
  const pedidoHastaAqui = new Map<string, number>();
  const problemas = new Map<string, ProblemaLinea>();

  for (const linea of lineas) {
    if (enBlanco(linea)) continue;
    const item = linea.clave ? porClave.get(linea.clave) : undefined;
    const cantidad = Number(linea.cantidad);

    const problema = ((): ProblemaLinea | null => {
      if (!item) return { campo: 'item', mensaje: 'Elija el insumo o producto' };
      if (linea.idAlmacen === null) return { campo: 'almacen', mensaje: 'Elija el almacén' };
      if (!(cantidad > 0)) return { campo: 'cantidad', mensaje: 'Indique la cantidad' };
      if (item.tipo === 'producto' && !Number.isInteger(cantidad)) {
        return { campo: 'cantidad', mensaje: 'Los productos se cuentan en unidades enteras' };
      }
      if ((linea.cantidad.split('.')[1] ?? '').length > DECIMALES_CANTIDAD) {
        return { campo: 'cantidad', mensaje: 'Hasta tres decimales: el gramo o el mililitro' };
      }

      if (!esIngreso) {
        const clave = `${item.clave}@${linea.idAlmacen}`;
        const antes = pedidoHastaAqui.get(clave) ?? 0;
        pedidoHastaAqui.set(clave, antes + cantidad);
        const hay = disponibleEn(item, linea.idAlmacen);
        if (antes + cantidad > hay) {
          const donde = nombreAlmacen.get(linea.idAlmacen) ?? 'este almacén';
          return {
            campo: 'cantidad',
            mensaje:
              `Solo hay ${formatearCantidad(hay)} ${item.unidad} en ${donde}` +
              (antes > 0 ? ` y otra línea ya saca ${formatearCantidad(antes)}` : ''),
          };
        }
      }

      if (esIngreso && linea.costoUnitario.trim() === '') {
        return { campo: 'costo', mensaje: 'Indique el costo' };
      }
      if (esIngreso && Number(linea.costoUnitario) < 0) {
        return { campo: 'costo', mensaje: 'El costo no puede ser negativo' };
      }
      if (esIngreso && item.controlaVencimiento && !linea.fechaVencimiento) {
        return { campo: 'vencimiento', mensaje: 'Es perecedero: indique su vencimiento' };
      }
      return null;
    })();

    if (problema) problemas.set(linea.uid, problema);
  }
  return problemas;
}

/**
 * Qué significa el costo de la línea, según el motivo y el ítem.
 *
 * El campo decía siempre «Precio pagado… recalcula el costo promedio del
 * insumo», también en un ajuste o una devolución, donde no se pagó nada y el
 * costo del insumo no cambia (solo lo hace una compra, `costeo.service`).
 */
function ayudaDeCosto(item: ItemMovible | null, esCompra: boolean): string {
  if (!item) return esCompra ? 'Lo que costó en esta compra' : 'Costo con el que entra al inventario';
  if (item.tipo === 'insumo') {
    return esCompra
      ? 'Lo que costó en esta compra: se promedia con el costo actual del insumo'
      : 'Solo valoriza la nota: el costo del insumo cambia únicamente con una compra';
  }
  if (item.costoPendiente) return 'Buscando su costo promedio…';
  if (item.costoSugerido === null) return 'Todavía no tiene costo: indique lo que costó elaborarlo o comprarlo';
  return `Su costo promedio es ${formatearBs(item.costoSugerido)}: lo que indique se promedia con él`;
}

/**
 * Editor de las líneas de una nota de inventario.
 *
 * Insumos y productos se ofrecen en un mismo selector en lugar de pedir primero
 * el tipo: son cinco controles por línea y en un teléfono eso ya no cabe. El
 * tipo se deduce del ítem elegido, que es lo que el servidor necesita para
 * separarlos en las dos listas del cuerpo.
 *
 * Los productos terminados se cuentan en unidades enteras y los insumos admiten
 * tres decimales —el gramo y el mililitro—, tal como declara el esquema; el
 * paso del campo se ajusta al ítem seleccionado.
 */
export function EditorLineas({
  lineas,
  items,
  almacenes,
  esIngreso,
  esCompra,
  problemas,
  onCambiar,
  onItemElegido,
}: {
  lineas: Linea[];
  items: ItemMovible[];
  almacenes: Almacen[];
  esIngreso: boolean;
  esCompra: boolean;
  /** Lo que falta en cada línea; `null` mientras no se intentó registrar. */
  problemas: Map<string, ProblemaLinea> | null;
  onCambiar: React.Dispatch<React.SetStateAction<Linea[]>>;
  onItemElegido?: (item: ItemMovible) => void;
}) {
  const porClave = new Map(items.map((i) => [i.clave, i]));

  const opcionesItem: Opcion<string>[] = items.map((item) => {
    const tipo = item.tipo === 'insumo' ? 'Insumo' : 'Producto';
    if (esIngreso) {
      return {
        valor: item.clave,
        etiqueta: item.nombre,
        descripcion: `${tipo} · ${item.unidad} · ${item.tipoConservacion.toLowerCase()}`,
      };
    }
    const hay = item.existencias.reduce((suma, e) => suma + e.stock, 0);
    return {
      valor: item.clave,
      etiqueta: item.nombre,
      descripcion: hay > 0 ? `${tipo} · hay ${formatearCantidad(hay)} ${item.unidad}` : `${tipo} · sin existencias`,
      deshabilitada: hay <= 0,
    };
  });

  function actualizar(uid: string, cambios: Partial<Linea>) {
    onCambiar((actuales) => actuales.map((l) => (l.uid === uid ? { ...l, ...cambios } : l)));
  }

  function elegirItem(uid: string, clave: string) {
    const item = porClave.get(clave);
    if (!item) return;
    const opciones = opcionesDeAlmacen(item, almacenes, esIngreso);

    onCambiar((actuales) =>
      actuales.map((l) =>
        l.uid === uid
          ? {
              ...l,
              clave,
              idAlmacen: almacenPropuesto(item, opciones, almacenes, l.idAlmacen, esIngreso),
              // El costo de referencia ahorra teclear lo habitual. Nunca el
              // precio de venta: el costo promedio del producto sale de estas
              // notas, y con él el margen se leía en cero.
              costoUnitario:
                esIngreso && item.costoSugerido !== null ? String(item.costoSugerido) : '',
            }
          : l,
      ),
    );
    onItemElegido?.(item);
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
          onClick={() =>
            onCambiar((actuales) => [...actuales, lineaVacia(actuales.at(-1)?.idAlmacen ?? null)])
          }
          icono={<Plus className="size-3.5" aria-hidden />}
        >
          Agregar línea
        </Boton>
      </div>

      <ul className="space-y-2.5">
        <AnimatePresence initial={false}>
          {lineas.map((linea) => {
            const item = linea.clave ? (porClave.get(linea.clave) ?? null) : null;
            const entero = item?.tipo === 'producto';
            const problema = problemas?.get(linea.uid);
            const errorEn = (campo: CampoLinea) =>
              problema?.campo === campo ? problema.mensaje : undefined;
            const hay =
              !esIngreso && item && linea.idAlmacen !== null
                ? disponibleEn(item, linea.idAlmacen)
                : null;

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
                <div
                  className={cn(
                    'rounded-xl border bg-white/[0.02] p-3',
                    problema ? 'border-peligro/40' : 'border-borde',
                  )}
                >
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
                        onClick={() => onCambiar((actuales) => actuales.filter((l) => l.uid !== linea.uid))}
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
                      error={errorEn('item')}
                    />

                    <Selector<number>
                      etiqueta="Almacén"
                      valor={linea.idAlmacen}
                      opciones={opcionesDeAlmacen(item, almacenes, esIngreso)}
                      onCambiar={(valor) => actualizar(linea.uid, { idAlmacen: valor })}
                      error={errorEn('almacen')}
                    />

                    <Campo
                      etiqueta="Cantidad"
                      type="number"
                      min={entero ? '1' : PASO_CANTIDAD}
                      step={entero ? '1' : PASO_CANTIDAD}
                      value={linea.cantidad}
                      onChange={(e) => actualizar(linea.uid, { cantidad: e.target.value })}
                      sufijo={item?.unidad}
                      error={errorEn('cantidad')}
                      ayuda={
                        hay !== null
                          ? `Hay ${formatearCantidad(hay)} ${item!.unidad} en este almacén`
                          : entero
                            ? 'Solo unidades enteras'
                            : undefined
                      }
                    />

                    {esIngreso && (
                      <Campo
                        etiqueta={`${esCompra ? 'Precio pagado' : 'Costo'} por ${item?.nombreUnidad ?? 'unidad'}`}
                        className="sm:col-span-2"
                        type="number"
                        min="0"
                        step="0.01"
                        value={linea.costoUnitario}
                        onChange={(e) => actualizar(linea.uid, { costoUnitario: e.target.value })}
                        sufijo="Bs"
                        error={errorEn('costo')}
                        ayuda={ayudaDeCosto(item, esCompra)}
                      />
                    )}

                    {/* El lote solo se pide donde aporta: al ingresar un
                        insumo perecedero. El servidor rechaza la nota si falta. */}
                    {esIngreso && item?.controlaVencimiento && (
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
                          value={linea.fechaVencimiento}
                          onChange={(e) =>
                            actualizar(linea.uid, { fechaVencimiento: e.target.value })
                          }
                          error={errorEn('vencimiento')}
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

      {esIngreso && (
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
