import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
import { SeguimientoEnVivo } from '@/components/pedidos/SeguimientoEnVivo';
import { useCompartirUbicacion } from '@/components/pedidos/usarCompartirUbicacion';
import { distanciaEnMetros, formatearDistancia } from '@/lib/geo';
import type { SeguimientoPedido } from '@/types';

/**
 * Seguimiento del repartidor en vivo.
 *
 * Dos lados: el repartidor comparte su ubicación sin gastar datos de más, y
 * el cliente lee en una línea si de verdad viene, a cuánto y hace cuánto se
 * supo. El mapa se sustituye por un doble: aquí importa qué recibe.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn() },
  ErrorApi: class ErrorApi extends Error {
    constructor(
      public readonly estado: number,
      mensaje: string,
    ) {
      super(mensaje);
    }
  },
}));

vi.mock('@/components/pedidos/MapaUbicacion', () => ({
  MapaUbicacion: ({ repartidor }: { repartidor: unknown }) => (
    <div data-testid="mapa" data-repartidor={JSON.stringify(repartidor)} />
  ),
}));

const { api, ErrorApi } = await import('@/lib/api');
const consultar = vi.mocked(api.get);
const enviar = vi.mocked(api.put);

const DESTINO = { lat: -17.783327, lon: -63.182076 };

const seguimiento = (cambios: Partial<SeguimientoPedido> = {}): SeguimientoPedido => ({
  enCamino: true,
  repartidor: 'Marcos',
  posicion: {
    // Unos 1.100 m al norte del destino.
    latitud: -17.773427,
    longitud: -63.182076,
    precision: 12,
    actualizadaEn: '2026-09-25T18:00:00.000Z',
    antiguedadSegundos: 20,
  },
  ...cambios,
});

beforeEach(() => vi.clearAllMocks());

describe('distancia', () => {
  it('mide en línea recta: un grado de latitud son unos 111 km', () => {
    const metros = distanciaEnMetros({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(metros).toBeGreaterThan(111_000);
    expect(metros).toBeLessThan(111_400);
  });

  it('se dice como en voz alta, sin exactitudes que el GPS no da', () => {
    expect(formatearDistancia(347)).toBe('350 m');
    expect(formatearDistancia(3)).toBe('10 m');
    expect(formatearDistancia(1234)).toBe('1,2 km');
  });
});

describe('SeguimientoEnVivo', () => {
  it('dice quién viene, a cuánto y hace cuánto se supo', async () => {
    consultar.mockResolvedValue(seguimiento());
    render(<SeguimientoEnVivo ruta="/pedidos/7/seguimiento" destino={DESTINO} para="cliente" />);

    expect(await screen.findByText(/Marcos viene en camino/)).toHaveTextContent(
      'Marcos viene en camino · a 1,1 km en línea recta · hace 20 s',
    );
    expect(consultar).toHaveBeenCalledWith('/pedidos/7/seguimiento');
    expect(screen.getByTestId('mapa').dataset.repartidor).toContain('"vieja":false');
  });

  it('una posición de hace rato se muestra como vieja, y lo explica', async () => {
    consultar.mockResolvedValue(
      seguimiento({
        posicion: { ...seguimiento().posicion!, antiguedadSegundos: 300 },
      }),
    );
    render(<SeguimientoEnVivo ruta="/pedidos/7/seguimiento" destino={DESTINO} para="cliente" />);

    expect(await screen.findByText(/Última ubicación de Marcos: hace 5 min/)).toBeInTheDocument();
    expect(screen.getByTestId('mapa').dataset.repartidor).toContain('"vieja":true');
  });

  it('en camino pero sin posición todavía: lo dice en vez de mostrar un mapa vacío sin explicación', async () => {
    consultar.mockResolvedValue(seguimiento({ posicion: null }));
    render(<SeguimientoEnVivo ruta="/pedidos/7/seguimiento" destino={DESTINO} para="cliente" />);

    expect(await screen.findByText(/Marcos salió con su pedido/)).toBeInTheDocument();
  });
});

/** Un GPS de mentira que entrega las lecturas que la prueba le pide. */
function gpsSimulado() {
  let alRecibir: PositionCallback = () => {};
  let alFallar: PositionErrorCallback | null = null;
  const geolocation = {
    watchPosition: vi.fn((ok: PositionCallback, error?: PositionErrorCallback | null) => {
      alRecibir = ok;
      alFallar = error ?? null;
      return 1;
    }),
    getCurrentPosition: vi.fn(),
    clearWatch: vi.fn(),
  };
  Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });

  return {
    geolocation,
    leer: (lat: number, lon: number, precision = 10) =>
      act(() =>
        alRecibir({
          coords: { latitude: lat, longitude: lon, accuracy: precision },
          timestamp: Date.now(),
        } as GeolocationPosition),
      ),
    denegar: () =>
      act(() =>
        alFallar?.({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
      ),
  };
}

describe('useCompartirUbicacion', () => {
  let ahora = 1_000_000;
  beforeEach(() => {
    ahora = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => ahora);
    enviar.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('sin un pedido en camino no pide la ubicación', () => {
    const gps = gpsSimulado();
    const { result } = renderHook(() => useCompartirUbicacion(false));

    expect(gps.geolocation.watchPosition).not.toHaveBeenCalled();
    expect(result.current.estado).toBe('apagada');
  });

  it('envía la primera lectura y después solo cada 15 s o si se movió', async () => {
    const gps = gpsSimulado();
    const { result } = renderHook(() => useCompartirUbicacion(true));

    await gps.leer(-17.783327, -63.182076);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith('/gestion/mi-posicion', {
      latitud: -17.783327,
      longitud: -63.182076,
      precision: 10,
    });
    expect(result.current.estado).toBe('compartiendo');

    // 5 s después y casi en el mismo lugar: no vale la pena enviar.
    ahora += 5_000;
    await gps.leer(-17.78333, -63.18208);
    expect(enviar).toHaveBeenCalledTimes(1);

    // Otros 5 s, pero ya a unos 110 m: se envía antes de los 15 s.
    ahora += 5_000;
    await gps.leer(-17.782327, -63.182076);
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it('sin permiso lo dice, para que el repartidor sepa qué hacer', async () => {
    const gps = gpsSimulado();
    const { result } = renderHook(() => useCompartirUbicacion(true));

    await gps.denegar();

    expect(result.current.estado).toBe('denegada');
  });

  it('si el pedido ya no está en camino, deja de insistir', async () => {
    enviar.mockRejectedValue(new ErrorApi(409, 'La ubicación se comparte solo…'));
    const gps = gpsSimulado();
    const { result } = renderHook(() => useCompartirUbicacion(true));

    await gps.leer(-17.783327, -63.182076);
    await act(async () => {});

    expect(result.current.estado).toBe('apagada');
    // Una lectura inmediata no reintenta: espera su turno.
    ahora += 1_000;
    await gps.leer(-17.783327, -63.182076);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('quieto, el teléfono no avisa: pasado un turno sin lecturas se le pregunta', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const gps = gpsSimulado();
    renderHook(() => useCompartirUbicacion(true));
    await gps.leer(-17.783327, -63.182076);

    // Pasan 15 s sin que el GPS diga nada.
    ahora += 15_000;
    act(() => vi.advanceTimersByTime(15_000));

    expect(gps.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('al terminar el reparto deja de vigilar el GPS', () => {
    const gps = gpsSimulado();
    const { rerender } = renderHook(({ activo }) => useCompartirUbicacion(activo), {
      initialProps: { activo: true },
    });

    rerender({ activo: false });

    expect(gps.geolocation.clearWatch).toHaveBeenCalledWith(1);
  });
});
