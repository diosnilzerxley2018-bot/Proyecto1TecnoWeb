import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MapaUbicacion } from '@/components/pedidos/MapaUbicacion';
import { redondearCoordenadas } from '@/lib/dominio';

/**
 * CU-PED-03 — el cliente marca dónde entregar.
 *
 * Leaflet se sustituye por un doble: dibujar teselas de verdad exige un
 * navegador con tamaños reales y aquí no aportaría nada. Lo que sí importa —y
 * es lo que se verifica— es el **contrato** del componente: qué escucha, qué
 * emite y qué deja de hacer cuando es de solo lectura.
 */

const manejadores = new Map<string, (evento: unknown) => void>();
const marcadores: { arrastrable: boolean; posicion: unknown }[] = [];

const mapa = {
  on: vi.fn((suceso: string, fn: (evento: unknown) => void) => manejadores.set(suceso, fn)),
  setView: vi.fn(),
  getZoom: vi.fn(() => 13),
  remove: vi.fn(),
};

vi.mock('leaflet', () => {
  const marker = (posicion: unknown, opciones: { draggable?: boolean }) => {
    const instancia = {
      posicion,
      on: vi.fn(),
      addTo: vi.fn(() => instancia),
      setLatLng: vi.fn(),
      remove: vi.fn(),
      getLatLng: () => ({ lat: 0, lng: 0 }),
    };
    marcadores.push({ arrastrable: Boolean(opciones.draggable), posicion });
    return instancia;
  };

  const api = {
    map: () => mapa,
    tileLayer: () => ({ addTo: vi.fn() }),
    marker,
    divIcon: () => ({}),
  };

  /**
   * Leaflet es UMD y sin campo `module`, así que el empaquetador lo entrega
   * con las funciones en la raíz **y** repetidas bajo `default`. El doble imita
   * esa forma para que la prueba recorra el mismo camino que el navegador.
   */
  return { ...api, default: api };
});

beforeEach(() => {
  vi.clearAllMocks();
  manejadores.clear();
  marcadores.length = 0;
});

describe('MapaUbicacion', () => {
  it('emite el punto redondeado cuando el cliente toca el mapa', async () => {
    const alCambiar = vi.fn();
    render(<MapaUbicacion valor={null} onCambiar={alCambiar} />);

    await waitFor(() => expect(manejadores.has('click')).toBe(true));

    // Coordenadas con más decimales de los que admite la columna.
    manejadores.get('click')!({ latlng: { lat: -17.7833271234, lng: -63.1821409876 } });

    expect(alCambiar).toHaveBeenCalledWith({ lat: -17.783327, lon: -63.182141 });
  });

  it('sin punto elegido no dibuja ninguna marca', async () => {
    render(<MapaUbicacion valor={null} onCambiar={vi.fn()} />);

    await waitFor(() => expect(mapa.on).toHaveBeenCalled());
    expect(marcadores).toHaveLength(0);
  });

  it('el punto elegido es arrastrable; el que solo se consulta, no', async () => {
    const punto = { lat: -17.78, lon: -63.18 };

    const { unmount } = render(<MapaUbicacion valor={punto} onCambiar={vi.fn()} />);
    await waitFor(() => expect(marcadores).toHaveLength(1));
    expect(marcadores[0].arrastrable).toBe(true);
    unmount();

    marcadores.length = 0;
    render(<MapaUbicacion valor={punto} />);
    await waitFor(() => expect(marcadores).toHaveLength(1));
    expect(marcadores[0].arrastrable).toBe(false);
  });

  it('en solo lectura no escucha los clics: no hay nada que elegir', async () => {
    render(<MapaUbicacion valor={{ lat: -17.78, lon: -63.18 }} />);

    await waitFor(() => expect(marcadores).toHaveLength(1));
    expect(manejadores.has('click')).toBe(false);
  });

  it('destruye el mapa al desmontarse, para no dejarlo colgado del DOM', async () => {
    const { unmount } = render(<MapaUbicacion valor={null} onCambiar={vi.fn()} />);

    await waitFor(() => expect(mapa.on).toHaveBeenCalled());
    unmount();

    expect(mapa.remove).toHaveBeenCalled();
  });
});

describe('redondearCoordenadas', () => {
  /** `ubicacion.latitud` es NUMERIC(8,6): más decimales los recorta la base. */
  it('deja seis decimales, que es lo que guarda la columna', () => {
    expect(redondearCoordenadas({ lat: -17.7833271234, lon: -63.1821409876 })).toEqual({
      lat: -17.783327,
      lon: -63.182141,
    });
  });

  it('no inventa decimales cuando el número ya es corto', () => {
    expect(redondearCoordenadas({ lat: -17.5, lon: -63 })).toEqual({ lat: -17.5, lon: -63 });
  });
});
