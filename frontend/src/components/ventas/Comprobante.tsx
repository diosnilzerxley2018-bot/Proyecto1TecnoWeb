'use client';

import { motion } from 'framer-motion';
import { Check, Printer } from 'lucide-react';
import { Boton } from '@/components/ui/Boton';
import { Ticket } from '@/components/ventas/Ticket';
import type { Comprobante as ComprobanteDatos } from '@/types';
import { formatearFecha } from '@/lib/formato';

/**
 * RF-VEN-06 — comprobante de la venta registrada.
 *
 * No existe tabla de comprobantes en el modelo de datos, y es coherente: el
 * comprobante no agrega información, la presenta. Se dibuja con la proporción
 * de un tique de caja (`Ticket`, el mismo del pedido pagado en el portal).
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

      <Ticket
        datos={{
          numero: datos.numero,
          filas: [
            ['Fecha', formatearFecha(datos.fecha)],
            ['Consumo', datos.tipoVenta],
            ['Cliente', datos.cliente],
            ['Atendió', datos.atendidoPor],
          ],
          detalle: datos.detalle,
          cantidadItems: datos.cantidadItems,
          pago: datos.metodoPago,
          total: datos.total,
          pie: ['¡Gracias por su compra!'],
        }}
      />

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
