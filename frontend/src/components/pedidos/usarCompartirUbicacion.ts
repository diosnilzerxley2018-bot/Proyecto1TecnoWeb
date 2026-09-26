'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ErrorApi } from '@/lib/api';
import { distanciaEnMetros } from '@/lib/geo';
import { redondearCoordenadas, type Coordenadas } from '@/lib/dominio';

/**
 * En qué anda la ubicación del repartidor.
 *
 * - `apagada`: no lleva ningún pedido en camino, no hay nada que compartir.
 * - `buscando`: pidió la ubicación y todavía no llegó la primera.
 * - `compartiendo`: el cliente ya la está viendo.
 * - `denegada`: el navegador no tiene permiso; hay que darlo en el sitio.
 * - `sin-senal`: el GPS no responde por ahora; se reintenta solo.
 * - `no-disponible`: este navegador no sabe dar la ubicación.
 */
export type EstadoUbicacion =
  | 'apagada'
  | 'buscando'
  | 'compartiendo'
  | 'denegada'
  | 'sin-senal'
  | 'no-disponible';

/** Cada cuánto se envía como máximo. El cliente consulta con el mismo ritmo. */
const INTERVALO_MS = 15_000;

/** Moverse esto adelanta el envío: en una avenida, quince segundos son varias cuadras. */
const DESPLAZAMIENTO_M = 40;

/**
 * Comparte la ubicación del repartidor mientras `activo` —mientras lleva un
 * pedido en camino—.
 *
 * El teléfono la informa por su cuenta cada vez que cambia; aquí se decide
 * cuándo vale la pena mandarla al servidor, para no gastar datos ni batería en
 * posiciones que no cambian nada. Mientras comparte, pide mantener la
 * pantalla encendida: con la pantalla apagada el navegador deja de dar la
 * ubicación, y el cliente vería al repartidor detenido.
 */
export function useCompartirUbicacion(activo: boolean) {
  const [estado, setEstado] = useState<EstadoUbicacion>('apagada');
  const [posicion, setPosicion] = useState<(Coordenadas & { precision: number }) | null>(null);
  const ultimoEnvio = useRef<{ en: number; punto: Coordenadas } | null>(null);
  const enviando = useRef(false);

  useEffect(() => {
    if (!activo) {
      setEstado('apagada');
      setPosicion(null);
      ultimoEnvio.current = null;
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setEstado('no-disponible');
      return;
    }

    setEstado('buscando');
    let vigente = true;
    let ultimaLectura = 0;

    const alRecibir = (lectura: GeolocationPosition) => {
      if (!vigente) return;
      ultimaLectura = Date.now();
      const punto = redondearCoordenadas({
        lat: lectura.coords.latitude,
        lon: lectura.coords.longitude,
      });
      setPosicion({ ...punto, precision: lectura.coords.accuracy });

      const previo = ultimoEnvio.current;
      const toca =
        !previo ||
        Date.now() - previo.en >= INTERVALO_MS ||
        distanciaEnMetros(previo.punto, punto) >= DESPLAZAMIENTO_M;
      if (!toca || enviando.current) return;

      // Se anota antes de enviar: si el envío falla, el próximo intento
      // espera su turno igual, en vez de repetirse con cada lectura del GPS.
      enviando.current = true;
      ultimoEnvio.current = { en: Date.now(), punto };
      api
        .put('/gestion/mi-posicion', {
          latitud: punto.lat,
          longitud: punto.lon,
          precision: Math.round(lectura.coords.accuracy),
        })
        .then(() => {
          if (vigente) setEstado('compartiendo');
        })
        .catch((e: unknown) => {
          // 409: el pedido ya no está en camino. La lista se pone al día sola
          // y con ella `activo`; mientras tanto no se insiste.
          if (vigente && e instanceof ErrorApi && e.estado === 409) setEstado('apagada');
        })
        .finally(() => {
          enviando.current = false;
        });
    };

    const alFallar = (error: GeolocationPositionError) => {
      if (!vigente) return;
      setEstado(error.code === error.PERMISSION_DENIED ? 'denegada' : 'sin-senal');
    };

    const opciones: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 30_000,
    };
    const vigilancia = navigator.geolocation.watchPosition(alRecibir, alFallar, opciones);

    /*
     * Quieto —en un semáforo, esperando en la puerta—, el teléfono deja de
     * avisar porque la posición no cambia. Sin noticias, el cliente vería al
     * repartidor como «sin señal» al rato. Si pasa un turno sin lecturas, se
     * le pregunta al teléfono, y la respuesta vuelve a enviarse aunque sea el
     * mismo punto: lo que se renueva es la hora.
     */
    const latido = window.setInterval(() => {
      if (Date.now() - ultimaLectura >= INTERVALO_MS) {
        navigator.geolocation.getCurrentPosition(alRecibir, alFallar, opciones);
      }
    }, INTERVALO_MS);

    return () => {
      vigente = false;
      navigator.geolocation.clearWatch(vigilancia);
      window.clearInterval(latido);
    };
  }, [activo]);

  // Pantalla encendida mientras se comparte, donde el navegador lo permita.
  const mantenerPantalla = estado === 'buscando' || estado === 'compartiendo';
  useEffect(() => {
    if (!mantenerPantalla || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }
    let bloqueo: WakeLockSentinel | null = null;
    let vigente = true;

    const pedir = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const obtenido = await navigator.wakeLock.request('screen');
        if (vigente) bloqueo = obtenido;
        else void obtenido.release();
      } catch {
        // Ahorro de batería o una pestaña sin foco: se vive sin él.
      }
    };

    // El navegador suelta el bloqueo al cambiar de pestaña: se vuelve a pedir al volver.
    const alVolver = () => void pedir();
    void pedir();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vigente = false;
      document.removeEventListener('visibilitychange', alVolver);
      void bloqueo?.release().catch(() => {});
    };
  }, [mantenerPantalla]);

  return { estado, posicion };
}
