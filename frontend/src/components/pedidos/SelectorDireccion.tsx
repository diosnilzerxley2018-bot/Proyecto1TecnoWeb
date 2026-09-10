'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Crosshair, House, MapPin, Plus } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { Campo } from '@/components/ui/Campo';
import { Casilla } from '@/components/ui/Casilla';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { MapaUbicacion } from '@/components/pedidos/MapaUbicacion';
import { redondearCoordenadas, type Coordenadas } from '@/lib/dominio';
import type { DestinoPedido, Direccion } from '@/types';
import { cn } from '@/lib/cn';

/**
 * CU-PED-03 — a dónde va el pedido.
 *
 * Un cliente no tiene una dirección, tiene varias: su casa, su oficina, la
 * casa de un familiar. Antes reescribía la suya en cada pedido porque las
 * direcciones no tenían dueño.
 *
 * El objetivo de esta pantalla es que **quien vuelve confirme en un clic**.
 * Por eso las guardadas se muestran primero y la primera viene elegida; el
 * formulario con el mapa solo aparece si pide una dirección distinta.
 */
export function SelectorDireccion({
  onCambiar,
}: {
  /** Emite el destino listo para enviar, o `null` si todavía está incompleto. */
  onCambiar: (destino: DestinoPedido | null) => void;
}) {
  const { notificar } = useNotificaciones();

  const [guardadas, setGuardadas] = useState<Direccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [elegida, setElegida] = useState<number | 'nueva'>('nueva');

  // Dirección escrita en el momento.
  const [calle, setCalle] = useState('');
  const [numero, setNumero] = useState('');
  const [referencia, setReferencia] = useState('');
  const [coordenadas, setCoordenadas] = useState<Coordenadas | null>(null);
  const [guardar, setGuardar] = useState(false);
  const [etiqueta, setEtiqueta] = useState('');
  const [ubicando, setUbicando] = useState(false);

  useEffect(() => {
    api
      .get<Direccion[]>('/ubicaciones')
      .then((lista) => {
        setGuardadas(lista);
        // La primera guardada viene elegida: es el caso de quien vuelve.
        if (lista.length > 0) setElegida(lista[0].id);
      })
      .catch(() => {
        // Sin direcciones guardadas se pide una nueva, que es lo que hay que
        // hacer de todos modos. No vale interrumpir con un error.
      })
      .finally(() => setCargando(false));
  }, []);

  /** Traduce el estado de la pantalla al destino que espera la API. */
  const emitir = useCallback(() => {
    if (elegida !== 'nueva') {
      onCambiar({ idUbicacion: elegida });
      return;
    }

    if (calle.trim().length < 3 || referencia.trim().length < 3) {
      onCambiar(null);
      return;
    }

    onCambiar({
      calle: calle.trim(),
      numero: numero.trim() || null,
      referencia: referencia.trim(),
      latitud: coordenadas?.lat ?? null,
      longitud: coordenadas?.lon ?? null,
      // Sin nombre no se guarda: fue una entrega de una sola vez.
      etiqueta: guardar && etiqueta.trim() ? etiqueta.trim() : null,
    });
  }, [elegida, calle, numero, referencia, coordenadas, guardar, etiqueta, onCambiar]);

  useEffect(() => {
    emitir();
  }, [emitir]);

  /**
   * RF-PED-04 — el navegador da la posición actual.
   *
   * Solo rellena las coordenadas, no la calle: convertir un punto en una
   * dirección escrita exige un servicio de geocodificación que el sistema no
   * usa. La referencia sigue siendo del cliente, y es la que encuentra la
   * puerta.
   */
  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      notificar('error', 'Su navegador no permite compartir la ubicación');
      return;
    }

    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        setCoordenadas(
          redondearCoordenadas({
            lat: posicion.coords.latitude,
            lon: posicion.coords.longitude,
          }),
        );
        setUbicando(false);
        notificar('exito', 'Listo. Ajuste el punto en el mapa si hace falta.');
      },
      () => {
        setUbicando(false);
        notificar('error', 'No se pudo obtener su ubicación. Márquela en el mapa.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  if (cargando) return <EsqueletoFilas filas={2} alto="h-16" />;

  return (
    <div className="space-y-3">
      {guardadas.map((direccion) => (
        <Opcion
          key={direccion.id}
          activa={elegida === direccion.id}
          onElegir={() => setElegida(direccion.id)}
          icono={<House className="size-4" aria-hidden />}
          titulo={direccion.etiqueta ?? direccion.calle}
          detalle={`${direccion.calle}${direccion.numero ? ` ${direccion.numero}` : ''} · ${direccion.referencia}`}
        />
      ))}

      <Opcion
        activa={elegida === 'nueva'}
        onElegir={() => setElegida('nueva')}
        icono={<Plus className="size-4" aria-hidden />}
        titulo={guardadas.length > 0 ? 'Otra dirección' : 'Indique su dirección'}
        detalle={
          guardadas.length > 0
            ? 'Para enviarlo a un lugar distinto esta vez'
            : 'La primera vez hay que escribirla'
        }
      />

      <AnimatePresence initial={false}>
        {elegida === 'nueva' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 rounded-xl border border-borde bg-superficie-alta p-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <Campo
                  etiqueta="Calle o avenida"
                  required
                  maxLength={150}
                  value={calle}
                  onChange={(e) => setCalle(e.target.value)}
                  placeholder="Av. Banzer"
                />
                <Campo
                  etiqueta="Número"
                  maxLength={20}
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="1200"
                />
              </div>

              <Campo
                etiqueta="Referencia"
                required
                maxLength={150}
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Frente al parque, portón verde"
                ayuda="Es lo que el repartidor usa para encontrar la puerta"
              />

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
                    Punto en el mapa
                  </p>
                  <button
                    type="button"
                    onClick={usarMiUbicacion}
                    disabled={ubicando}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border border-borde px-2.5 py-1.5',
                      'text-[11px] text-tinta-suave transition-colors',
                      'hover:border-marca-500/40 hover:text-marca-300',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    <Crosshair
                      className={cn('size-3.5', ubicando && 'animate-pulse')}
                      aria-hidden
                    />
                    {ubicando ? 'Ubicando…' : 'Usar mi ubicación actual'}
                  </button>
                </div>

                <MapaUbicacion valor={coordenadas} onCambiar={setCoordenadas} altura="h-80 sm:h-96" />

                <p className="mt-1.5 text-[11px] text-tinta-tenue">
                  Toque el mapa para marcar otro punto. Sirve para pedir a un lugar donde no está
                  ahora: su casa mientras usted trabaja, por ejemplo.
                </p>
              </div>

              <div className="border-t border-borde pt-3">
                <Casilla
                  marcada={guardar}
                  onCambiar={() => setGuardar((v) => !v)}
                  etiqueta="Guardar esta dirección para la próxima vez"
                />

                <AnimatePresence initial={false}>
                  {guardar && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden pt-3"
                    >
                      <Campo
                        etiqueta="Nombre"
                        maxLength={50}
                        value={etiqueta}
                        onChange={(e) => setEtiqueta(e.target.value)}
                        placeholder="Casa, Oficina, Casa de mamá…"
                        ayuda="Con este nombre la va a reconocer la próxima vez"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Tarjeta de opción. Se comporta como un radio pero con espacio para el detalle. */
function Opcion({
  activa,
  onElegir,
  icono,
  titulo,
  detalle,
}: {
  activa: boolean;
  onElegir: () => void;
  icono: React.ReactNode;
  titulo: string;
  detalle: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={onElegir}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors duration-200',
        activa
          ? 'border-marca-500/50 bg-marca-500/[0.08]'
          : 'border-borde hover:border-borde-fuerte hover:bg-white/[0.03]',
      )}
    >
      <span
        className={cn(
          'mt-0.5 shrink-0',
          activa ? 'text-marca-400' : 'text-tinta-tenue',
        )}
      >
        {icono}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm', activa ? 'text-tinta' : 'text-tinta-suave')}>
          {titulo}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-tinta-tenue">{detalle}</span>
      </span>
      {activa && <MapPin className="mt-0.5 size-4 shrink-0 text-marca-400" aria-hidden />}
    </button>
  );
}
