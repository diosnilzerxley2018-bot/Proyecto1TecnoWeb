'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Banknote, FlaskConical, Landmark, ShieldAlert, TriangleAlert } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { Boton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/Dialogo';
import { Insignia } from '@/components/ui/Insignia';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import type { EstadoCobro, ModoCobro } from '@/types';
import { formatearFecha } from '@/lib/formato';
import { cn } from '@/lib/cn';

const MODOS: {
  valor: ModoCobro;
  titulo: string;
  descripcion: string;
  icono: typeof FlaskConical;
}[] = [
  {
    valor: 'Simulado',
    titulo: 'Simulado',
    descripcion:
      'No se mueve dinero. Los cobros se generan y se confirman solos, para desarrollo y demostraciones.',
    icono: FlaskConical,
  },
  {
    valor: 'Real',
    titulo: 'Dinero real',
    descripcion:
      'Los cobros se envían a la pasarela contratada y el dinero llega a la cuenta del negocio.',
    icono: Landmark,
  },
];

/**
 * RF-PED-04 — modo de cobro del sistema.
 *
 * El sistema arranca en simulado y solo el administrador puede activar el
 * dinero real. Es un interruptor y no una variable de entorno porque cambiarlo
 * tiene que poder hacerse sin reiniciar el servidor ni pedirle nada a nadie.
 *
 * El paso a real pide confirmación escrita: no es un ajuste que convenga
 * cambiar con un clic distraído.
 */
export function PanelModoCobro() {
  const { notificar } = useNotificaciones();

  const [estado, setEstado] = useState<EstadoCobro | null>(null);
  const [cargando, setCargando] = useState(true);
  const [confirmando, setConfirmando] = useState<ModoCobro | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setEstado(await api.get<EstadoCobro>('/configuracion/cobro'));
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo leer el modo de cobro');
    } finally {
      setCargando(false);
    }
  }, [notificar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cambiar(modo: ModoCobro) {
    setEnviando(true);
    try {
      const nuevo = await api.put<EstadoCobro>('/configuracion/cobro', { modo });
      setEstado(nuevo);
      setConfirmando(null);
      notificar(
        'exito',
        modo === 'Real'
          ? 'Cobro real activado: las ventas en línea van a mover dinero'
          : 'Modo simulado activado: no se moverá dinero real',
      );
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo cambiar el modo');
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <EsqueletoFilas filas={3} alto="h-20" />;
  if (!estado) return null;

  const enReal = estado.modo === 'Real';

  return (
    <section className="superficie-tarjeta rounded-2xl">
      <header className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-4">
        <Banknote className="size-4 shrink-0 text-marca-400" aria-hidden />
        <h2 className="text-sm font-medium text-tinta">Modo de cobro</h2>
        <Insignia tono={enReal ? 'marca' : 'aviso'} punto>
          {enReal ? 'Dinero real' : 'Simulado'}
        </Insignia>
        <span className="ml-auto text-[11px] text-tinta-tenue">
          Pasarela: {estado.pasarela}
        </span>
      </header>

      <div className="space-y-4 px-5 py-5">
        <AnimatePresence>
          {estado.advertencia && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              role="alert"
              className="flex items-start gap-2 overflow-hidden rounded-xl border border-aviso/25 bg-aviso/10 px-3.5 py-2.5 text-xs leading-relaxed text-aviso"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {estado.advertencia}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="grid gap-3 sm:grid-cols-2">
          {MODOS.map((modo) => {
            const Icono = modo.icono;
            const activo = estado.modo === modo.valor;

            return (
              <button
                key={modo.valor}
                type="button"
                disabled={activo}
                onClick={() => setConfirmando(modo.valor)}
                className={cn(
                  'rounded-xl border p-4 text-left transition-colors duration-200',
                  activo
                    ? 'cursor-default border-marca-500/50 bg-marca-500/[0.08]'
                    : 'border-borde hover:border-borde-fuerte hover:bg-white/[0.03]',
                )}
              >
                <span className="flex items-center gap-2">
                  <Icono
                    className={cn('size-4 shrink-0', activo ? 'text-marca-400' : 'text-tinta-tenue')}
                    aria-hidden
                  />
                  <span className={cn('text-sm', activo ? 'text-tinta' : 'text-tinta-suave')}>
                    {modo.titulo}
                  </span>
                  {activo && (
                    <Insignia tono="marca" className="ml-auto">
                      Activo
                    </Insignia>
                  )}
                </span>
                <span className="mt-2 block text-[11px] leading-relaxed text-tinta-tenue">
                  {modo.descripcion}
                </span>
              </button>
            );
          })}
        </div>

        {estado.actualizadoEn && (
          <p className="text-[11px] text-tinta-tenue">
            Último cambio: {formatearFecha(estado.actualizadoEn)}
            {estado.actualizadoPor && ` · ${estado.actualizadoPor}`}
          </p>
        )}
      </div>

      <Dialogo
        abierto={confirmando !== null}
        onCerrar={() => setConfirmando(null)}
        titulo={confirmando === 'Real' ? 'Activar cobro con dinero real' : 'Volver al modo simulado'}
        ancho="max-w-md"
      >
        {confirmando === 'Real' ? (
          <div className="space-y-4">
            {/* El texto va dentro de un `span`: sin él, cada fragmento se
                convierte en un elemento del flex y la frase se parte en
                columnas en vez de leerse corrida. */}
            <div className="flex items-start gap-2 rounded-xl border border-peligro/25 bg-peligro/10 px-3.5 py-3 text-sm leading-relaxed text-peligro">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                A partir de este momento cada venta y cada pedido en línea van a{' '}
                <strong className="font-semibold">cobrar dinero de verdad</strong> a través de{' '}
                {/* La pasarela que va a cobrar, no la que está en uso hoy:
                    mientras el modo sea simulado, `pasarela` dice «Simulada». */}
                {estado.pasarelaReal}.
              </span>
            </div>
            <ul className="space-y-1.5 text-xs leading-relaxed text-tinta-suave">
              <li>· Los cobros que ya existen conservan el modo con el que nacieron.</li>
              <li>· Los cobros simulados quedan marcados como tales para siempre.</li>
              <li>· Puede volver al modo simulado cuando quiera.</li>
            </ul>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-tinta-suave">
            Los cobros dejarán de mover dinero. Sirve para probar el sistema o para operar
            mientras no haya contrato con una pasarela.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Boton variante="fantasma" onClick={() => setConfirmando(null)}>
            Cancelar
          </Boton>
          <Boton
            variante={confirmando === 'Real' ? 'peligro' : 'primario'}
            cargando={enviando}
            onClick={() => confirmando && cambiar(confirmando)}
          >
            {confirmando === 'Real' ? 'Sí, cobrar dinero real' : 'Volver a simulado'}
          </Boton>
        </div>
      </Dialogo>
    </section>
  );
}
