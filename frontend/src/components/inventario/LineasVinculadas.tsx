'use client';

import { Boxes, CalendarClock, Package } from 'lucide-react';
import { Campo } from '@/components/ui/Campo';
import type { DocumentoVinculable, LineaVinculable } from '@/types';
import { DECIMALES_CANTIDAD, PASO_CANTIDAD } from '@/lib/dominio';
import { formatearVencimiento } from '@/lib/inventario';
import { formatearBs, formatearCantidad } from '@/lib/formato';
import { cn } from '@/lib/cn';

/**
 * Las líneas de una devolución al proveedor o de una reposición, tomadas del
 * documento elegido (Compra → Devolución → Reposición).
 *
 * No se eligen ítems: se ofrece lo que entró en la compra, o lo que salió en
 * la devolución, y solo se indica cuánto. Una devolución empieza en blanco
 * —se devuelve lo que llegó mal, no todo—; una reposición empieza con lo que
 * falta reponer. El almacén es el de la línea: se devuelve de donde entró y se
 * repone donde estaba. El precio de la reposición es el de la compra, y el
 * servidor es quien lo pone.
 */

export interface ValorVinculado {
  cantidad: string;
  codigoLote: string;
  fechaVencimiento: string;
}

/** Una línea se identifica por ítem y almacén, como en el servidor. */
export const claveVinculada = (l: Pick<LineaVinculable, 'tipo' | 'id' | 'idAlmacen'>) =>
  `${l.tipo}:${l.id}@${l.idAlmacen}`;

/** Hasta cuánto se puede: lo que falta y, al devolver, lo que hay para sacar. */
export const maximoDe = (l: LineaVinculable) =>
  l.existencia === null ? l.pendiente : Math.min(l.pendiente, l.existencia);

/** Lo que propone cada línea al elegir el documento. */
export function valoresIniciales(
  documento: DocumentoVinculable,
  reponiendo: boolean,
): Record<string, ValorVinculado> {
  return Object.fromEntries(
    documento.lineas.map((l) => [
      claveVinculada(l),
      { cantidad: reponiendo ? String(l.pendiente) : '', codigoLote: '', fechaVencimiento: '' },
    ]),
  );
}

/** Qué le falta o le sobra a cada línea, por su clave. Vacía, se ignora. */
export function revisarVinculadas(
  documento: DocumentoVinculable,
  valores: Record<string, ValorVinculado>,
  reponiendo: boolean,
): Map<string, string> {
  const problemas = new Map<string, string>();
  for (const linea of documento.lineas) {
    const k = claveVinculada(linea);
    const valor = valores[k];
    if (!valor || valor.cantidad.trim() === '') continue;

    const cantidad = Number(valor.cantidad);
    const maximo = maximoDe(linea);
    const mensaje = (() => {
      if (!(cantidad >= 0)) return 'Indique una cantidad válida';
      if (linea.tipo === 'producto' && !Number.isInteger(cantidad)) {
        return 'Los productos se cuentan en unidades enteras';
      }
      if ((valor.cantidad.split('.')[1] ?? '').length > DECIMALES_CANTIDAD) {
        return 'Hasta tres decimales: el gramo o el mililitro';
      }
      if (cantidad > maximo) return `Hasta ${formatearCantidad(maximo)} ${linea.unidad}`;
      if (reponiendo && cantidad > 0 && linea.controlaVencimiento && !valor.fechaVencimiento) {
        return 'Es perecedero: indique el vencimiento de lo que llega';
      }
      return null;
    })();
    if (mensaje) problemas.set(k, mensaje);
  }
  return problemas;
}

export function LineasVinculadas({
  documento,
  reponiendo,
  valores,
  problemas,
  onCambiar,
}: {
  documento: DocumentoVinculable;
  /** Una reposición; si no, una devolución al proveedor. */
  reponiendo: boolean;
  valores: Record<string, ValorVinculado>;
  problemas: Map<string, string> | null;
  onCambiar: (clave: string, cambios: Partial<ValorVinculado>) => void;
}) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
        {reponiendo ? 'Lo que se repone' : 'Lo que se devuelve'}
      </h3>
      <ul className="space-y-2.5">
        {documento.lineas.map((linea) => {
          const k = claveVinculada(linea);
          const valor = valores[k] ?? { cantidad: '', codigoLote: '', fechaVencimiento: '' };
          const problema = problemas?.get(k);
          const maximo = maximoDe(linea);
          const llega = reponiendo && linea.controlaVencimiento && Number(valor.cantidad) > 0;

          return (
            <li
              key={k}
              className={cn(
                'rounded-xl border bg-white/[0.02] p-3',
                problema ? 'border-peligro/40' : 'border-borde',
              )}
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-start">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm text-tinta">
                    {linea.tipo === 'insumo' ? (
                      <Boxes className="size-4 shrink-0 text-info" aria-label="Insumo" />
                    ) : (
                      <Package className="size-4 shrink-0 text-marca-400" aria-label="Producto" />
                    )}
                    <span className="truncate">{linea.nombre}</span>
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-tinta-tenue">
                    {linea.almacen} ·{' '}
                    {reponiendo
                      ? `salieron ${formatearCantidad(linea.cantidad)} ${linea.unidad}` +
                        (linea.vinculado > 0
                          ? `, ya se repusieron ${formatearCantidad(linea.vinculado)}`
                          : '')
                      : `entraron ${formatearCantidad(linea.cantidad)} ${linea.unidad} a ${formatearBs(linea.costoUnitario)}` +
                        (linea.vinculado > 0
                          ? `, ya se devolvieron ${formatearCantidad(linea.vinculado)}`
                          : '')}
                  </p>
                  {linea.lote && (
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-tinta-suave">
                      <CalendarClock className="size-3.5 shrink-0 text-info" aria-hidden />
                      Sale del lote {linea.lote.codigo ?? 'de esta compra'}, vence{' '}
                      {formatearVencimiento(linea.lote.vencimiento)}
                    </p>
                  )}
                  {reponiendo && (
                    <p className="mt-1 text-[11px] text-tinta-suave">
                      Vuelve al precio de la compra: {formatearBs(linea.costoUnitario)} /{linea.unidad}
                    </p>
                  )}
                </div>

                <Campo
                  etiqueta={reponiendo ? 'Cantidad a reponer' : 'Cantidad a devolver'}
                  type="number"
                  min="0"
                  max={maximo}
                  step={linea.tipo === 'producto' ? '1' : PASO_CANTIDAD}
                  inputMode="decimal"
                  placeholder="0"
                  value={valor.cantidad}
                  onChange={(e) => onCambiar(k, { cantidad: e.target.value })}
                  sufijo={linea.unidad}
                  error={problema}
                  ayuda={
                    problema
                      ? undefined
                      : maximo < linea.pendiente
                        ? `Hay ${formatearCantidad(maximo)} para devolver`
                        : `${reponiendo ? 'Falta reponer' : 'Hasta'} ${formatearCantidad(maximo)}`
                  }
                />
              </div>

              {llega && (
                <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                  <Campo
                    etiqueta="Código de lote"
                    maxLength={50}
                    value={valor.codigoLote}
                    onChange={(e) => onCambiar(k, { codigoLote: e.target.value })}
                    ayuda="Opcional: el que trae la mercadería nueva"
                  />
                  <Campo
                    etiqueta="Vence"
                    type="date"
                    value={valor.fechaVencimiento}
                    onChange={(e) => onCambiar(k, { fechaVencimiento: e.target.value })}
                    ayuda="El de lo que llega, no el de lo devuelto"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
