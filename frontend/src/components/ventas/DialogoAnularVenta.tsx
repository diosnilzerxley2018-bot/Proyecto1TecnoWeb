'use client';

import { useState } from 'react';
import { Ban, HandCoins, PackageOpen, TriangleAlert } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { Dialogo } from '@/components/ui/Dialogo';
import { AreaTexto } from '@/components/ui/Campo';
import { Boton } from '@/components/ui/Boton';
import type { AnulacionVenta, Venta } from '@/types';
import { formatearBs } from '@/lib/formato';

/**
 * Anulación de una venta registrada.
 *
 * Devuelve el stock al inventario y cierra el cobro. Lo que **no** hace es
 * entregar el dinero: si la venta estaba cobrada, el sistema registra que
 * corresponde una devolución y avisa, pero el reintegro es un acto humano —en
 * efectivo desde la caja, o desde el panel de la pasarela—.
 *
 * El motivo es obligatorio porque la operación mueve inventario y puede
 * implicar dinero: tiene que quedar dicho por qué se hizo.
 */
export function DialogoAnularVenta({
  venta,
  onCerrar,
  onAnulada,
}: {
  venta: Venta | null;
  onCerrar: () => void;
  onAnulada: (resultado: AnulacionVenta) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!venta) return null;

  const estabaCobrada = venta.estadoPago === 'Pagado';
  const unidades = venta.items.reduce((suma, i) => suma + i.cantidad, 0);

  async function anular() {
    if (!venta) return;
    setError(null);
    setEnviando(true);
    try {
      const resultado = await api.post<AnulacionVenta>(`/ventas/${venta.id}/anular`, {
        motivo: motivo.trim(),
      });
      setMotivo('');
      onAnulada(resultado);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo anular la venta');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      titulo="Anular venta"
      descripcion={`V-${String(venta.id).padStart(6, '0')} · ${formatearBs(venta.total)}`}
      ancho="max-w-md"
    >
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-xl border border-borde bg-white/[0.02] px-3.5 py-3 text-sm leading-relaxed text-tinta-suave">
          <PackageOpen className="mt-0.5 size-4 shrink-0 text-marca-400" aria-hidden />
          <span>
            Se devolverán <strong className="font-semibold text-tinta">{unidades}</strong>{' '}
            unidad(es) al inventario, al mismo almacén del que salieron.
          </span>
        </p>

        {estabaCobrada && (
          <p className="flex items-start gap-2 rounded-xl border border-aviso/25 bg-aviso/10 px-3.5 py-3 text-sm leading-relaxed text-aviso">
            <HandCoins className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Esta venta ya estaba cobrada. El sistema va a registrar el reembolso, pero{' '}
              <strong className="font-semibold">no entrega el dinero</strong>: hay que devolverlo
              en caja o desde el panel de la pasarela.
            </span>
          </p>
        )}

        <AreaTexto
          etiqueta="Motivo de la anulación"
          required
          minLength={4}
          maxLength={200}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Por ejemplo: el cliente se arrepintió, se cobró un producto equivocado…"
          ayuda="Queda registrado junto con quién anuló la venta"
        />

        {error && (
          <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="peligro"
            cargando={enviando}
            disabled={motivo.trim().length < 4}
            onClick={anular}
            icono={<Ban className="size-4" aria-hidden />}
          >
            Anular venta
          </Boton>
        </div>

        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-tinta-tenue">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
          La anulación no se puede deshacer. La venta queda registrada como anulada, no se borra.
        </p>
      </div>
    </Dialogo>
  );
}
