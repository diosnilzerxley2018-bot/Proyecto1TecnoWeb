'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CENTRO_REPARTO, redondearCoordenadas, type Coordenadas } from '@/lib/dominio';
import { cn } from '@/lib/cn';

/**
 * Mapa del punto de entrega — CU-PED-03 «Gestionar Ubicación».
 *
 * Se usa Leaflet directamente y no un envoltorio de React. Un mapa es un objeto
 * imperativo con ciclo de vida propio: meterlo en el árbol de React sumaría una
 * dependencia más y no evitaría el `useEffect`, que haría falta igual para
 * crearlo y destruirlo.
 *
 * Leaflet toca `window` al importarse, así que se carga **dentro** del efecto:
 * en el render del servidor este componente no llega a pedirlo y no hace falta
 * envolverlo en `dynamic(..., { ssr: false })` en cada pantalla que lo use.
 *
 * Un único componente sirve a los dos lados del caso de uso: **sin `onCambiar`
 * el mapa es de solo lectura**, que es como lo mira el repartidor. Duplicarlo
 * en «uno para elegir» y «otro para ver» habría sido el mismo mapa dos veces.
 *
 * Con `repartidor`, el mismo mapa muestra además por dónde viene quien lleva
 * el pedido: así el cliente y el repartidor lo siguen en la aplicación, sin
 * salir a otra.
 */
export function MapaUbicacion({
  valor,
  onCambiar,
  repartidor = null,
  altura = 'h-72 sm:h-80',
  className,
}: {
  /** Punto elegido. `null` mientras el cliente no haya marcado ninguno. */
  valor: Coordenadas | null;
  /** Ausente, el mapa solo se mira. Presente, el punto se elige y se arrastra. */
  onCambiar?: (coordenadas: Coordenadas) => void;
  /** Dónde está el repartidor, mientras el pedido va en camino. */
  repartidor?: PuntoRepartidor | null;
  altura?: string;
  className?: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<Leaflet.Map | null>(null);
  const marca = useRef<Leaflet.Marker | null>(null);
  const marcaRepartidor = useRef<Leaflet.Marker | null>(null);
  const circuloPrecision = useRef<Leaflet.Circle | null>(null);
  /** El encuadre de los dos puntos se hace una vez: después manda el zoom de quien mira. */
  const encuadrado = useRef(false);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const [listo, setListo] = useState(false);

  const editable = onCambiar !== undefined;

  /**
   * El callback vive en una `ref` para que su identidad no entre en las
   * dependencias del efecto que construye el mapa: cambiar de función en un
   * render no debe reconstruir el mapa ni perder el zoom del usuario.
   */
  const alCambiar = useRef(onCambiar);
  useEffect(() => {
    alCambiar.current = onCambiar;
  }, [onCambiar]);

  useEffect(() => {
    let vigente = true;
    let instancia: Leaflet.Map | null = null;

    void (async () => {
      const L = await cargarLeaflet();
      // El componente pudo desmontarse mientras se cargaba la librería.
      if (!vigente || !contenedor.current) return;

      leaflet.current = L;
      instancia = L.map(contenedor.current, {
        center: [CENTRO_REPARTO.lat, CENTRO_REPARTO.lon],
        zoom: ZOOM_CIUDAD,
        // Arranca apagado: robarle la rueda al documento hace que la página se
        // atasque cuando alguien pasa por encima del mapa al desplazarse. Se
        // enciende al interactuar (más abajo), que es cuando sí se quiere.
        scrollWheelZoom: false,
        attributionControl: true,
      });

      /*
       * La rueda hace zoom solo mientras el puntero está sobre el mapa **y**
       * ya se interactuó con él. Es el término medio entre un mapa que no se
       * puede acercar y uno que secuestra el desplazamiento de la página.
       */
      instancia.on('mouseover', () => instancia?.scrollWheelZoom.enable());
      instancia.on('mouseout', () => instancia?.scrollWheelZoom.disable());

      L.tileLayer(TESELAS, { maxZoom: ZOOM_MAXIMO, attribution: CREDITO }).addTo(instancia);

      if (alCambiar.current) {
        instancia.on('click', (evento: Leaflet.LeafletMouseEvent) => {
          alCambiar.current?.(
            redondearCoordenadas({ lat: evento.latlng.lat, lon: evento.latlng.lng }),
          );
        });
      }

      mapa.current = instancia;
      setListo(true);
    })();

    return () => {
      vigente = false;
      instancia?.remove();
      mapa.current = null;
      marca.current = null;
      marcaRepartidor.current = null;
      circuloPrecision.current = null;
      encuadrado.current = false;
    };
  }, []);

  /** Refleja el punto elegido: crea, mueve o quita la marca. */
  useEffect(() => {
    const L = leaflet.current;
    const instancia = mapa.current;
    if (!L || !instancia) return;

    if (!valor) {
      marca.current?.remove();
      marca.current = null;
      return;
    }

    const punto: Leaflet.LatLngExpression = [valor.lat, valor.lon];

    if (marca.current) {
      marca.current.setLatLng(punto);
    } else {
      const marcador = L.marker(punto, {
        // Un icono propio evita el clásico marcador roto de Leaflet con
        // empaquetadores —sus imágenes se resuelven por ruta relativa— y de
        // paso usa el color de marca del tema.
        icon: L.divIcon({ className: '', html: PIN, iconSize: [30, 30], iconAnchor: [15, 30] }),
        draggable: editable,
        keyboard: editable,
        title: editable ? 'Arrastre para ajustar el punto de entrega' : 'Punto de entrega',
      });

      if (editable) {
        marcador.on('dragend', () => {
          const { lat, lng } = marcador.getLatLng();
          alCambiar.current?.(redondearCoordenadas({ lat, lon: lng }));
        });
      }

      marcador.addTo(instancia);
      marca.current = marcador;
    }

    /*
     * Con el repartidor en el mapa, el encuadre lo decide el efecto que sigue.
     * En solo lectura, sin animación: Leaflet ignora un cambio de vista pedido
     * mientras otro zoom está animándose, y el encuadre de los dos puntos
     * —que suele llegar justo detrás— se perdía y el repartidor quedaba fuera
     * del mapa.
     */
    if (!repartidor) {
      instancia.setView(punto, Math.max(instancia.getZoom(), ZOOM_PUERTA), { animate: editable });
    }
  }, [valor, listo, editable, repartidor]);

  /**
   * Refleja la posición del repartidor: crea, mueve o quita su marca.
   *
   * La primera vez encuadra los dos puntos —el destino y quien viene—; las
   * siguientes solo mueve la marca. Reencuadrar en cada actualización le
   * quitaría el zoom a quien está mirando cada quince segundos.
   */
  useEffect(() => {
    const L = leaflet.current;
    const instancia = mapa.current;
    if (!L || !instancia) return;

    if (!repartidor) {
      marcaRepartidor.current?.remove();
      circuloPrecision.current?.remove();
      marcaRepartidor.current = null;
      circuloPrecision.current = null;
      encuadrado.current = false;
      return;
    }

    const punto: Leaflet.LatLngExpression = [repartidor.lat, repartidor.lon];
    // Una posición vieja se ve atenuada: está, pero puede no ser la de ahora.
    const opacidad = repartidor.vieja ? 0.5 : 1;

    if (marcaRepartidor.current) {
      marcaRepartidor.current.setLatLng(punto).setOpacity(opacidad);
    } else {
      marcaRepartidor.current = L.marker(punto, {
        icon: L.divIcon({
          className: '',
          html: REPARTIDOR,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        keyboard: false,
        title: 'Repartidor',
        opacity: opacidad,
        // Por encima del punto de entrega cuando se acercan.
        zIndexOffset: 1000,
      }).addTo(instancia);
    }

    // El círculo dice cuánto se puede confiar en el punto. Uno de kilómetros
    // (la ubicación por antena) taparía el mapa entero sin aportar nada.
    const precision = repartidor.precision ?? 0;
    if (precision > 0 && precision <= PRECISION_MAXIMA_VISIBLE) {
      if (circuloPrecision.current) {
        circuloPrecision.current.setLatLng(punto).setRadius(precision);
      } else {
        circuloPrecision.current = L.circle(punto, {
          radius: precision,
          color: 'var(--color-info)',
          weight: 1,
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(instancia);
      }
    } else {
      circuloPrecision.current?.remove();
      circuloPrecision.current = null;
    }

    if (!encuadrado.current) {
      encuadrado.current = true;
      if (valor) {
        instancia.fitBounds(L.latLngBounds([punto, [valor.lat, valor.lon]]), {
          padding: [36, 36],
          maxZoom: ZOOM_PUERTA,
          animate: false,
        });
      } else {
        instancia.setView(punto, Math.max(instancia.getZoom(), ZOOM_BARRIO), { animate: false });
      }
    }
  }, [repartidor, valor, listo]);

  return (
    <div
      className={cn(
        // `isolate` encierra el apilamiento de Leaflet, que usa z-index hasta
        // 1000 y si no taparía la cabecera fija del portal.
        'mapa-entrega relative isolate overflow-hidden rounded-xl border border-borde bg-superficie-alta',
        altura,
        className,
      )}
    >
      <div
        ref={contenedor}
        className="size-full"
        role="application"
        aria-label={
          editable
            ? 'Mapa para marcar el punto de entrega'
            : repartidor
              ? 'Mapa con el punto de entrega y la posición del repartidor'
              : 'Mapa con el punto de entrega'
        }
      />

      {/*
        Sin esta pista, un mapa editable y uno de consulta se ven idénticos y
        nadie descubre que se puede tocar. Desaparece al marcar el primer
        punto, cuando ya cumplió su función.
      */}
      {editable && !valor && (
        <p className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] bg-gradient-to-t from-fondo/90 to-transparent px-3 pb-2.5 pt-6 text-center text-[11px] text-tinta-suave">
          Toque el mapa para marcar el punto de entrega
        </p>
      )}
    </div>
  );
}

/**
 * Carga Leaflet salvando la diferencia de empaquetado.
 *
 * `leaflet@1.9` se publica como UMD y **sin campo `module` ni `exports`** en su
 * `package.json`. Según cómo resuelva el empaquetador, `import()` devuelve las
 * funciones en la raíz del módulo o colgadas de `default`. Elegir una sola de
 * las dos formas compila igual de bien y revienta en el navegador con un
 * `L.map is not a function`, que no se ve ni en el typecheck ni en el build
 * porque este código solo corre en el cliente.
 */
async function cargarLeaflet(): Promise<typeof Leaflet> {
  const modulo = await import('leaflet');
  const conDefault = modulo as { default?: typeof Leaflet };
  return conDefault.default ?? (modulo as typeof Leaflet);
}

/** Teselas de OpenStreetMap: sin clave de API y sin coste. */
const TESELAS = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** La licencia de OpenStreetMap exige que el crédito quede visible. */
const CREDITO =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const ZOOM_CIUDAD = 13;
/** Acercamiento al que se ven las calles de alrededor. */
const ZOOM_BARRIO = 15;
/** Acercamiento al que se distingue una puerta de la de al lado. */
const ZOOM_PUERTA = 17;
const ZOOM_MAXIMO = 19;

/** Más allá de esta incertidumbre, en metros, el círculo no se dibuja. */
const PRECISION_MAXIMA_VISIBLE = 500;

/** La posición del repartidor, tal como la dibuja el mapa. */
export interface PuntoRepartidor extends Coordenadas {
  /** Radio de incertidumbre en metros. */
  precision?: number | null;
  /** Hace rato que no se actualiza: se dibuja atenuada. */
  vieja?: boolean;
}

const PIN = `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"
  style="filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.45))">
  <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"
    fill="var(--color-marca-500)" stroke="var(--color-sobre-marca)" stroke-width="1.5"/>
  <circle cx="12" cy="10" r="2.6" fill="var(--color-sobre-marca)"/>
</svg>`;

/** El repartidor: un círculo de otro color que el destino, con una bicicleta. */
const REPARTIDOR = `<svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true"
  style="filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.45))">
  <circle cx="17" cy="17" r="15" fill="var(--color-info)" stroke="white" stroke-width="2.5"/>
  <g transform="translate(8 8) scale(0.75)" fill="none" stroke="white" stroke-width="2.2"
    stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/>
    <circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
  </g>
</svg>`;
