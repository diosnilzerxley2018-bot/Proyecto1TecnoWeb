'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FlaskConical,
  Loader2,
  TriangleAlert,
} from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { Dialogo } from '@/components/ui/Dialogo';
import { Boton } from '@/components/ui/Boton';
import { Insignia } from '@/components/ui/Insignia';
import type { Pago } from '@/types';
import { formatearBs } from '@/lib/formato';

/** Cada cuánto se le pregunta al servidor si el cobro ya se acreditó. */
const INTERVALO_CONSULTA_MS = 2500;

/**
 * RF-PED-04 — pantalla de cobro.
 *
 * Muestra el código QR o el enlace de pago y espera a que el dinero llegue.
 * La confirmación no se decide aquí: se consulta al servidor, que a su vez le
 * pregunta a la pasarela. La interfaz nunca da un cobro por pagado por su
 * cuenta.
 *
 * Se consulta en lugar de esperar un aviso porque los avisos de las pasarelas
 * se pierden, y un cliente frente a una pantalla que nunca cambia no tiene
 * forma de saber si pagó o no.
 */
export function DialogoCobro({
  pago,
  onCerrar,
  onPagado,
  permiteConfirmarManual = false,
}: {
  pago: Pago | null;
  onCerrar: () => void;
  onPagado: (pagado: Pago) => void;
  /** El mostrador puede dar por recibido un pago que verificó en su banco. */
  permiteConfirmarManual?: boolean;
}) {
  const [actual, setActual] = useState<Pago | null>(pago);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const yaAvisado = useRef(false);

  useEffect(() => {
    setActual(pago);
    setError(null);
    yaAvisado.current = false;
  }, [pago]);

  const consultar = useCallback(async (id: number) => {
    try {
      return await api.get<Pago>(`/pagos/${id}`);
    } catch {
      // Un fallo de red no cambia el estado del cobro: se reintenta solo.
      return null;
    }
  }, []);

  // Consulta periódica mientras el cobro siga pendiente.
  useEffect(() => {
    if (!actual || actual.estado !== 'Pendiente') return;

    const id = actual.id;
    let vigente = true;

    const temporizador = setInterval(async () => {
      const fresco = await consultar(id);
      if (vigente && fresco) setActual(fresco);
    }, INTERVALO_CONSULTA_MS);

    return () => {
      vigente = false;
      clearInterval(temporizador);
    };
  }, [actual, consultar]);

  // Se avisa una sola vez, aunque la consulta vuelva a traer el mismo estado.
  useEffect(() => {
    if (actual?.estado === 'Pagado' && !yaAvisado.current) {
      yaAvisado.current = true;
      onPagado(actual);
    }
  }, [actual, onPagado]);

  async function confirmarManual() {
    if (!actual) return;
    setError(null);
    setConfirmando(true);
    try {
      setActual(await api.post<Pago>(`/pagos/${actual.id}/confirmar`, {}));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo confirmar el cobro');
    } finally {
      setConfirmando(false);
    }
  }

  if (!actual) return null;

  const pagado = actual.estado === 'Pagado';
  const fallido = actual.estado === 'Fallido' || actual.estado === 'Vencido';

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      titulo={pagado ? 'Cobro acreditado' : 'Cobrar'}
      descripcion={`${formatearBs(actual.monto)} · ${actual.metodo}`}
      ancho="max-w-sm"
    >
      <div className="space-y-4">
        {actual.simulado && (
          <p className="flex items-start gap-2 rounded-xl border border-aviso/25 bg-aviso/10 px-3.5 py-2.5 text-xs leading-relaxed text-aviso">
            <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
            Modo simulado: <strong className="font-semibold">no se está cobrando dinero real</strong>.
            El código sirve para demostrar el flujo.
          </p>
        )}

        <AnimatePresence mode="wait">
          {pagado ? (
            <motion.div
              key="pagado"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              className="grid place-items-center gap-3 rounded-xl border border-marca-500/30 bg-marca-500/[0.08] px-4 py-8"
            >
              <CheckCircle2 className="size-10 text-marca-400" aria-hidden />
              <p className="text-sm text-tinta">Pago recibido</p>
              {actual.referenciaExterna && (
                <p className="text-[11px] text-tinta-tenue">Ref. {actual.referenciaExterna}</p>
              )}
            </motion.div>
          ) : fallido ? (
            <motion.div
              key="fallido"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid place-items-center gap-3 rounded-xl border border-peligro/25 bg-peligro/10 px-4 py-8 text-center"
            >
              <TriangleAlert className="size-8 text-peligro" aria-hidden />
              <p className="text-sm text-peligro">
                {actual.estado === 'Vencido'
                  ? 'El plazo del cobro venció'
                  : 'El cobro no se completó'}
              </p>
              <p className="text-[11px] leading-relaxed text-tinta-tenue">
                Puede generarse un cobro nuevo o cobrar en efectivo.
              </p>
            </motion.div>
          ) : (
            <motion.div key="esperando" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {actual.tipoDatos === 'url' && actual.datosCobro ? (
                <a
                  href={actual.datosCobro}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-marca-500/40 bg-marca-500/10 px-4 py-6 text-sm text-marca-300 transition-colors hover:bg-marca-500/15"
                >
                  <ExternalLink className="size-4" aria-hidden />
                  Abrir la página de pago
                </a>
              ) : actual.qrImagen ? (
                <div className="grid place-items-center gap-3">
                  {/* El código lo dibuja el servidor: una pasarela real puede
                      devolver la imagen ya hecha o el texto a codificar, y esa
                      diferencia no debe llegar hasta aquí. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={actual.qrImagen}
                    alt="Código QR para pagar"
                    className="size-56 rounded-xl bg-white p-2"
                  />
                  <p className="text-[11px] text-tinta-tenue">
                    Escanee con la aplicación de su banco
                  </p>
                </div>
              ) : (
                <p className="rounded-xl border border-borde bg-white/[0.02] px-3.5 py-6 text-center text-xs text-tinta-tenue">
                  Preparando el cobro…
                </p>
              )}

              <p className="mt-4 flex items-center justify-center gap-2 text-xs text-tinta-tenue">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Esperando la confirmación del pago
              </p>

              {actual.expiraEn && (
                <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] text-tinta-tenue">
                  <Clock className="size-3" aria-hidden />
                  El código vence a las{' '}
                  {new Date(actual.expiraEn).toLocaleTimeString('es-BO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-borde pt-4">
          <Insignia tono={pagado ? 'marca' : fallido ? 'peligro' : 'aviso'} punto={!pagado && !fallido}>
            {actual.estado}
          </Insignia>

          <div className="flex gap-2">
            {permiteConfirmarManual && !pagado && !fallido && (
              <Boton
                variante="contorno"
                tamano="sm"
                cargando={confirmando}
                onClick={confirmarManual}
              >
                Ya me pagó
              </Boton>
            )}
            <Boton variante={pagado ? 'primario' : 'fantasma'} tamano="sm" onClick={onCerrar}>
              {pagado ? 'Continuar' : 'Cerrar'}
            </Boton>
          </div>
        </div>
      </div>
    </Dialogo>
  );
}
