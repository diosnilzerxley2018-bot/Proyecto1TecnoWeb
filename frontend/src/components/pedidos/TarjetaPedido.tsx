'use client';

import { Bike, Clock, MapPin, Receipt } from 'lucide-react';
import { Tarjeta } from '@/components/ui/Tarjeta';
import { Insignia } from '@/components/ui/Insignia';
import type { PedidoGestion } from '@/types';
import { ETIQUETA_ESTADO, TONO_ESTADO, formatearBs, tiempoTranscurrido } from '@/lib/pedidos';

/** Resumen de un pedido en el tablero. Al pulsarla se abre el panel de detalle. */
export function TarjetaPedido({
  pedido,
  indice,
  onAbrir,
}: {
  pedido: PedidoGestion;
  indice: number;
  onAbrir: () => void;
}) {
  const cantidadItems = pedido.items.reduce((total, item) => total + item.cantidad, 0);
  const pagado = pedido.estadoPago === 'Pagado';

  return (
    <Tarjeta
      interactiva
      onClick={onAbrir}
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, delay: Math.min(indice * 0.04, 0.3), ease: 'easeOut' }}
      className="group flex flex-col gap-3.5 p-4"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAbrir();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-tinta-tenue">
            #{String(pedido.id).padStart(5, '0')}
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-tinta">
            {pedido.cliente.nombreCompleto}
          </p>
        </div>
        <Insignia
          tono={TONO_ESTADO[pedido.estadoPedido]}
          punto={pedido.estadoPedido === 'En camino'}
        >
          {ETIQUETA_ESTADO[pedido.estadoPedido]}
        </Insignia>
      </div>

      <div className="flex items-start gap-2 text-xs text-tinta-suave">
        <MapPin className="mt-0.5 size-3.5 shrink-0 text-tinta-tenue" aria-hidden />
        <span className="line-clamp-2">
          {pedido.ubicacion.calle}
          {pedido.ubicacion.numero && ` ${pedido.ubicacion.numero}`}
          {pedido.ubicacion.referencia && ` · ${pedido.ubicacion.referencia}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-tinta-tenue">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden />
          {tiempoTranscurrido(pedido.fecha)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Receipt className="size-3.5" aria-hidden />
          {cantidadItems} {cantidadItems === 1 ? 'ítem' : 'ítems'}
        </span>
        {pedido.repartidor && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Bike className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{pedido.repartidor.nombreCompleto}</span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-borde pt-3">
        <span
          className={`text-[11px] ${pagado ? 'text-marca-400' : 'text-aviso'}`}
          title={`Pago ${pedido.estadoPago.toLowerCase()} por ${pedido.metodoPago}`}
        >
          {pedido.metodoPago} · {pedido.estadoPago}
        </span>
        <span className="font-semibold tabular-nums text-tinta">
          {formatearBs(pedido.total)}
        </span>
      </div>
    </Tarjeta>
  );
}
