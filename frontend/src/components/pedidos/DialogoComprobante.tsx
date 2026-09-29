'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Download, Mail } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { Dialogo } from '@/components/ui/Dialogo';
import { Boton } from '@/components/ui/Boton';
import { Esqueleto } from '@/components/ui/Esqueleto';
import { Ticket } from '@/components/ventas/Ticket';
import { formatearFecha } from '@/lib/formato';
import type { ComprobantePedido, EnvioComprobante } from '@/types';

/**
 * Manda el comprobante al correo de la cuenta y dice cómo le fue.
 *
 * El destino no se elige: el servidor lo manda siempre al correo del cliente,
 * para que el botón no sirva para escribirle a cualquiera en nombre del
 * negocio. La respuesta dice a cuál fue, que es lo que el cliente quiere leer.
 */
export async function enviarComprobantePorCorreo(idPedido: number): Promise<string> {
  const r = await api.post<EnvioComprobante>(`/pedidos/${idPedido}/comprobante/enviar`);
  if (!r.enviado) {
    throw new ErrorApi(502, r.motivo ?? 'El servidor de correo no aceptó el mensaje. Intente más tarde.');
  }
  return `Comprobante enviado a ${r.para}`;
}

/** Descarga el PDF con un nombre que se entiende en la carpeta de descargas. */
async function descargarPdf(idPedido: number) {
  const blob = await api.descargar(`/pedidos/${idPedido}/comprobante.pdf`);
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `comprobante-pedido-${String(idPedido).padStart(5, '0')}.pdf`;
  enlace.click();
  URL.revokeObjectURL(url);
}

/**
 * El comprobante del pedido pagado, como el tique del mostrador (RF-VEN-06).
 *
 * Se abre solo apenas se acredita un pago en línea —quien paga en el local se
 * va con su comprobante, y quien paga desde su casa también debe tenerlo— y
 * desde «Mis pedidos», en cualquier momento. `recienPagado` agrega arriba la
 * confirmación del pago y avisa que la copia ya va a su correo.
 */
export function DialogoComprobante({
  idPedido,
  recienPagado = false,
  textoCerrar = 'Cerrar',
  onCerrar,
}: {
  idPedido: number | null;
  recienPagado?: boolean;
  textoCerrar?: string;
  onCerrar: () => void;
}) {
  const { notificar } = useNotificaciones();
  const [datos, setDatos] = useState<ComprobantePedido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    setDatos(null);
    setError(null);
    if (idPedido === null) return;

    let vigente = true;
    api
      .get<ComprobantePedido>(`/pedidos/${idPedido}/comprobante`)
      .then((c) => vigente && setDatos(c))
      .catch((e) => vigente && setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el comprobante'));
    return () => {
      vigente = false;
    };
  }, [idPedido]);

  async function enviar() {
    if (idPedido === null) return;
    setEnviando(true);
    try {
      notificar('exito', await enviarComprobantePorCorreo(idPedido));
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo enviar el comprobante');
    } finally {
      setEnviando(false);
    }
  }

  async function descargar() {
    if (idPedido === null) return;
    setDescargando(true);
    try {
      await descargarPdf(idPedido);
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo descargar el comprobante');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <Dialogo abierto={idPedido !== null} onCerrar={onCerrar} titulo="Comprobante" ancho="max-w-sm">
      <div className="space-y-5">
        {recienPagado && (
          <div className="space-y-2 text-center">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              className="mx-auto grid size-14 place-items-center rounded-full bg-marca-500/15 text-marca-400"
            >
              <Check className="size-7" strokeWidth={3} aria-hidden />
            </motion.div>
            <p className="text-sm text-tinta">Pago acreditado. Su pedido entró a preparación</p>
            <p className="text-xs text-tinta-tenue">Le enviamos una copia de este comprobante a su correo.</p>
          </div>
        )}

        {error ? (
          <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
            {error}
          </p>
        ) : datos ? (
          <Ticket
            datos={{
              numero: datos.numero,
              subtitulo: 'Comprobante de pago',
              filas: [
                ['Fecha', formatearFecha(datos.fecha)],
                ...(datos.pagadoEn ? ([['Pagado', formatearFecha(datos.pagadoEn)]] as [string, string][]) : []),
                ['Cliente', datos.cliente],
                ['Entrega', datos.entrega],
                ...(datos.referenciaPago
                  ? ([['Ref. de pago', datos.referenciaPago]] as [string, string][])
                  : []),
              ],
              detalle: datos.detalle,
              cantidadItems: datos.cantidadItems,
              pago: datos.metodoPago,
              total: datos.total,
              pie: ['¡Gracias por su compra!', `Soporte: ${datos.soporte}`],
            }}
          />
        ) : (
          <Esqueleto className="mx-auto h-80 max-w-xs rounded-xl" />
        )}

        <div className="flex flex-wrap justify-center gap-2">
          <Boton
            variante="secundario"
            onClick={() => void enviar()}
            cargando={enviando}
            disabled={!datos}
            icono={<Mail className="size-4" aria-hidden />}
          >
            Enviar a mi correo
          </Boton>
          <Boton
            variante="secundario"
            onClick={() => void descargar()}
            cargando={descargando}
            disabled={!datos}
            icono={<Download className="size-4" aria-hidden />}
          >
            Descargar PDF
          </Boton>
          <Boton variante="primario" onClick={onCerrar}>
            {textoCerrar}
          </Boton>
        </div>
      </div>
    </Dialogo>
  );
}
