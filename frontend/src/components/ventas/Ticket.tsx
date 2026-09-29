'use client';

import { motion } from 'framer-motion';
import { formatearBs } from '@/lib/formato';

/** Una línea del tique: lo que se llevó y cuánto costó. */
export interface LineaTicket {
  idProducto: number;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface DatosTicket {
  numero: string;
  /** Qué es, bajo el número: «Comprobante de pago». */
  subtitulo?: string;
  /** Datos de la operación, término y valor, en el orden en que se leen. */
  filas: [string, string][];
  detalle: LineaTicket[];
  cantidadItems: number;
  pago: string;
  total: number;
  /** Renglones del pie: el agradecimiento, el contacto de soporte. */
  pie: string[];
}

/**
 * El tique de caja (RF-VEN-06), común a la venta del mostrador y al pedido.
 *
 * Existía solo para la venta, dentro de su comprobante. El pedido pagado en
 * línea necesita el mismo, y dibujarlo dos veces habría dejado dos tiques que
 * se parecen pero no son iguales. Aquí solo se presenta: quién lo muestra
 * decide los botones.
 */
export function Ticket({ datos }: { datos: DatosTicket }) {
  return (
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
        {datos.subtitulo && <p className="mt-0.5 text-[10px] text-tinta-tenue">{datos.subtitulo}</p>}
      </header>

      <dl className="space-y-1 border-b border-dashed border-borde py-3 text-[11px] text-tinta-tenue">
        {datos.filas.map(([termino, descripcion]) => (
          <div key={termino} className="flex justify-between gap-2">
            <dt className="shrink-0">{termino}</dt>
            <dd className="min-w-0 break-words text-right text-tinta-suave">{descripcion}</dd>
          </div>
        ))}
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
          <span>{datos.pago}</span>
        </div>
        <div className="flex justify-between border-t border-borde pt-2 text-sm font-semibold text-tinta">
          <span>TOTAL</span>
          <span className="tabular-nums">{formatearBs(datos.total)}</span>
        </div>
      </div>

      <div className="space-y-0.5 border-t border-dashed border-borde pt-3 text-center text-[10px] text-tinta-tenue">
        {datos.pie.map((renglon) => (
          <p key={renglon} className="break-words">
            {renglon}
          </p>
        ))}
      </div>
    </motion.article>
  );
}
