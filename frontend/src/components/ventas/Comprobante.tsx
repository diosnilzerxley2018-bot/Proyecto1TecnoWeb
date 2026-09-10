'use client';

import { motion } from 'framer-motion';
import { Check, Printer } from 'lucide-react';
import { Boton } from '@/components/ui/Boton';
import type { Comprobante as ComprobanteDatos } from '@/types';
import { formatearBs, formatearFecha } from '@/lib/formato';

/**
 * RF-VEN-06 — comprobante de la venta registrada.
 *
 * No existe tabla de comprobantes en el modelo de datos, y es coherente: el
 * comprobante no agrega información, la presenta. Se dibuja con la proporción
 * de un tique de caja para que resulte reconocible.
 */
export function Comprobante({
  datos,
  onCerrar,
}: {
  datos: ComprobanteDatos;
  onCerrar: () => void;
}) {
  return (
    <div className="space-y-5">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 18 }}
        className="mx-auto grid size-14 place-items-center rounded-full bg-marca-500/15 text-marca-400"
      >
        <Check className="size-7" strokeWidth={3} aria-hidden />
      </motion.div>

      <p className="text-center text-sm text-tinta">Venta registrada correctamente</p>

      <motion.article
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="mx-auto max-w-xs rounded-xl border border-borde bg-superficie-alta p-5 font-mono text-xs"
      >
        <header className="border-b border-dashed border-borde pb-3 text-center">
          <p className="text-sm font-semibold tracking-tight text-tinta">NUTRIEXPRESS</p>
          <p className="mt-0.5 text-[10px] text-tinta-tenue">Comida saludable</p>
          <p className="mt-2 text-tinta-suave">{datos.numero}</p>
        </header>

        <dl className="space-y-1 border-b border-dashed border-borde py-3 text-[11px] text-tinta-tenue">
          <Fila termino="Fecha" descripcion={formatearFecha(datos.fecha)} />
          <Fila termino="Consumo" descripcion={datos.tipoVenta} />
          <Fila termino="Cliente" descripcion={datos.cliente} />
          <Fila termino="Atendió" descripcion={datos.atendidoPor} />
        </dl>

        <ul className="space-y-2 border-b border-dashed border-borde py-3">
          {datos.detalle.map((linea) => (
            <li key={linea.idProducto}>
              <div className="flex justify-between gap-2 text-tinta">
                <span className="min-w-0 truncate">{linea.nombre}</span>
                <span className="shrink-0 tabular-nums">{formatearBs(linea.subtotal)}</span>
              </div>
              <p className="text-[10px] tabular-nums text-tinta-tenue">
                {linea.cantidad} × {formatearBs(linea.precioUnitario)}
              </p>
            </li>
          ))}
        </ul>

        <div className="space-y-1 py-3">
          <div className="flex justify-between text-[11px] text-tinta-tenue">
            <span>Artículos</span>
            <span className="tabular-nums">{datos.cantidadItems}</span>
          </div>
          <div className="flex justify-between text-[11px] text-tinta-tenue">
            <span>Pago</span>
            <span>{datos.metodoPago}</span>
          </div>
          <div className="flex justify-between border-t border-borde pt-2 text-sm font-semibold text-tinta">
            <span>TOTAL</span>
            <span className="tabular-nums">{formatearBs(datos.total)}</span>
          </div>
        </div>

        <p className="border-t border-dashed border-borde pt-3 text-center text-[10px] text-tinta-tenue">
          ¡Gracias por su compra!
        </p>
      </motion.article>

      <div className="flex justify-center gap-2">
        <Boton
          variante="secundario"
          onClick={() => window.print()}
          icono={<Printer className="size-4" aria-hidden />}
        >
          Imprimir
        </Boton>
        <Boton variante="primario" onClick={onCerrar}>
          Nueva venta
        </Boton>
      </div>
    </div>
  );
}

function Fila({ termino, descripcion }: { termino: string; descripcion: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{termino}</dt>
      <dd className="min-w-0 truncate text-right text-tinta-suave">{descripcion}</dd>
    </div>
  );
}
