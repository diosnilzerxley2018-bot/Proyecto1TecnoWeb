import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaginaEntregas from '@/app/(privado)/entregas/page';
import { separarTransiciones } from '@/lib/pedidos';
import { api } from '@/lib/api';

/**
 * RF-PED-07 — el turno del repartidor en «Mis entregas».
 *
 * La pantalla arrancaba siempre en «Fuera de turno» porque nunca le preguntaba
 * al servidor: al volver a ella contradecía a la base y ofrecía «Iniciar
 * turno» a quien ya lo tenía abierto. Estas pruebas fijan que lo que se ve es
 * lo que está guardado.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn(), patch: vi.fn() },
  // Misma firma que la real: el estado HTTP primero y el mensaje después.
  ErrorApi: class extends Error {
    constructor(
      public readonly estado: number,
      mensaje: string,
    ) {
      super(mensaje);
    }
  },
}));

// El permiso lo verifica el servidor; aquí interesa solo el contenido.
vi.mock('@/components/RequierePermiso', () => ({
  RequierePermiso: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const notificar = vi.fn();
vi.mock('@/components/ui/Notificaciones', () => ({
  useNotificaciones: () => ({ notificar }),
}));

/** El cargo de quien mira; cada prueba puede cambiarlo. */
let cargo: string | null | undefined = 'Repartidor';
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ sesion: { usuario: { id: 9, cargo } } }),
}));

const pedir = vi.mocked(api.get);
const enviar = vi.mocked(api.put);

/** Responde según la ruta, como el servidor. */
function servidorCon(turno: Promise<{ disponible: boolean }>, entregas: unknown[] = []) {
  pedir.mockImplementation((ruta: string) => {
    if (ruta === '/gestion/disponibilidad') return turno as Promise<never>;
    if (ruta === '/gestion/mis-entregas') return Promise.resolve(entregas as never);
    return Promise.reject(new Error(`ruta inesperada: ${ruta}`));
  });
}

/** Una entrega en la calle. Sin coordenadas, para no montar el mapa. */
const enCamino = {
  id: 11,
  fecha: new Date().toISOString(),
  estadoPedido: 'En camino',
  estadoPago: 'Pendiente',
  metodoPago: 'Efectivo',
  total: 44.1,
  fechaEntrega: null,
  cancelable: false,
  referenciaPago: null,
  ubicacion: {
    calle: 'Avenida Banzer',
    numero: '1200',
    referencia: 'Puerta verde',
    latitud: null,
    longitud: null,
  },
  items: [],
  cliente: { id: 3, nombreCompleto: 'Camila Cliente', telefono: null },
  repartidor: { id: 9, nombreCompleto: 'David Martinez' },
  transicionesPosibles: ['Entregado', 'Cancelado'],
};

/** Un pedido que la cocina está preparando: el repartidor sale con él. */
const porSalir = { ...enCamino, id: 12, estadoPedido: 'En preparacion', transicionesPosibles: ['En camino'] };

/** Uno que la cocina todavía no empezó. */
const enCocina = { ...enCamino, id: 13, estadoPedido: 'Recibido', transicionesPosibles: ['En preparacion'] };

beforeEach(() => {
  vi.clearAllMocks();
  cargo = 'Repartidor';
});

describe('Mis entregas · turno', () => {
  /** El caso que fallaba: el turno estaba abierto y la pantalla decía lo contrario. */
  it('muestra «de turno» cuando el servidor dice que lo está', async () => {
    servidorCon(Promise.resolve({ disponible: true }));
    render(<PaginaEntregas />);

    expect(await screen.findByText('Está de turno')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Terminar turno' })).toBeEnabled();
    expect(screen.queryByText('Fuera de turno')).toBeNull();
  });

  it('muestra «fuera de turno» cuando el servidor dice que no lo está', async () => {
    servidorCon(Promise.resolve({ disponible: false }));
    render(<PaginaEntregas />);

    expect(await screen.findByText('Fuera de turno')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar turno' })).toBeEnabled();
  });

  /**
   * Mientras no se sabe, no se afirma nada ni se deja pulsar: el botón invierte
   * el estado actual, y sin conocerlo ofrecería la acción equivocada.
   */
  it('mientras consulta no afirma ningún estado y no deja cambiarlo', async () => {
    servidorCon(new Promise(() => {})); // nunca responde
    render(<PaginaEntregas />);

    expect(screen.getByText('Consultando su turno…')).toBeInTheDocument();
    expect(screen.queryByText('Fuera de turno')).toBeNull();
    expect(screen.queryByText('Está de turno')).toBeNull();
    expect(screen.getByRole('button', { name: 'Iniciar turno' })).toBeDisabled();
  });

  it('al terminar el turno envía el estado contrario al leído', async () => {
    servidorCon(Promise.resolve({ disponible: true }));
    enviar.mockResolvedValue({ disponible: false } as never);
    render(<PaginaEntregas />);

    await userEvent.click(await screen.findByRole('button', { name: 'Terminar turno' }));

    expect(enviar).toHaveBeenCalledWith('/gestion/disponibilidad', { disponible: false });
    await waitFor(() => expect(screen.getByText('Fuera de turno')).toBeInTheDocument());
  });

  /** Una consulta que falla no se lleva a la otra por delante. */
  it('si falla la consulta del turno, la lista de entregas igual se muestra', async () => {
    servidorCon(Promise.reject(new Error('caída')));
    render(<PaginaEntregas />);

    expect(await screen.findByText('Sin entregas asignadas')).toBeInTheDocument();
    expect(notificar).toHaveBeenCalledWith('error', 'No se pudo consultar su turno');
  });
});

/**
 * CU-PED-02 — el repartidor cierra su entrega desde su propia pantalla.
 *
 * Es el único que puede hacerlo, así que el botón tiene que estar donde él
 * mira, no en el tablero general entre los pedidos de todos.
 */
describe('Mis entregas · cerrar la entrega', () => {
  it('ofrece las dos salidas de un pedido en camino', async () => {
    servidorCon(Promise.resolve({ disponible: true }), [enCamino]);
    render(<PaginaEntregas />);

    expect(await screen.findByRole('button', { name: 'Registrar entrega' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No pude entregarlo' })).toBeInTheDocument();
  });

  /** Las dos salidas son definitivas: un roce con el pulgar no debe cerrar nada. */
  it('no cierra la entrega sin confirmarla', async () => {
    servidorCon(Promise.resolve({ disponible: true }), [enCamino]);
    render(<PaginaEntregas />);

    await userEvent.click(await screen.findByRole('button', { name: 'Registrar entrega' }));
    expect(api.patch).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('registrar la entrega la informa al servidor y recarga la lista', async () => {
    servidorCon(Promise.resolve({ disponible: true }), [enCamino]);
    vi.mocked(api.patch).mockResolvedValue({} as never);
    render(<PaginaEntregas />);

    await userEvent.click(await screen.findByRole('button', { name: 'Registrar entrega' }));
    // En efectivo, la confirmación es también el recordatorio de cobrar.
    expect(screen.getByText(/Confirme que recibió Bs 44,10 en efectivo/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, entregado y cobrado' }));

    expect(api.patch).toHaveBeenCalledWith('/gestion/pedidos/11/estado', { estado: 'Entregado' });
    await waitFor(() =>
      expect(notificar).toHaveBeenCalledWith('exito', expect.stringContaining('entregado y cobrado')),
    );
  });

  it('si no había nadie, lo registra como no entregado y avisa que se notificó al cliente', async () => {
    servidorCon(Promise.resolve({ disponible: true }), [enCamino]);
    vi.mocked(api.patch).mockResolvedValue({} as never);
    render(<PaginaEntregas />);

    await userEvent.click(await screen.findByRole('button', { name: 'No pude entregarlo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, no se pudo entregar' }));

    expect(api.patch).toHaveBeenCalledWith('/gestion/pedidos/11/estado', { estado: 'Cancelado' });
    await waitFor(() =>
      expect(notificar).toHaveBeenCalledWith(
        'exito',
        'Pedido #00011 registrado como no entregado. Se le avisó al cliente',
      ),
    );
  });

  /** El servidor rechaza a quien no es el repartidor asignado; se muestra tal cual. */
  it('muestra el motivo cuando el servidor rechaza el cierre', async () => {
    const { ErrorApi } = await import('@/lib/api');
    servidorCon(Promise.resolve({ disponible: true }), [enCamino]);
    vi.mocked(api.patch).mockRejectedValue(
      new ErrorApi(403, 'Solo el repartidor asignado puede cerrar esta entrega.'),
    );
    render(<PaginaEntregas />);

    await userEvent.click(await screen.findByRole('button', { name: 'Registrar entrega' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, entregado y cobrado' }));

    await waitFor(() =>
      expect(notificar).toHaveBeenCalledWith(
        'error',
        'Solo el repartidor asignado puede cerrar esta entrega.',
      ),
    );
  });
});

/**
 * Lo que encontró el recorrido de un pedido en efectivo, de punta a punta.
 */
describe('Mis entregas · la pantalla sigue la tarea del repartidor', () => {
  it('dice cuánto cobrar en un pedido en efectivo', async () => {
    servidorCon(Promise.resolve({ disponible: true }), [enCamino]);
    render(<PaginaEntregas />);

    expect(await screen.findByText('Cobrar Bs 44,10 en efectivo')).toBeInTheDocument();
  });

  it('avisa que no hay que cobrar un pedido ya pagado en línea', async () => {
    const pagadoConQr = { ...enCamino, metodoPago: 'QR', estadoPago: 'Pagado' };
    servidorCon(Promise.resolve({ disponible: true }), [pagadoConQr]);
    render(<PaginaEntregas />);

    expect(await screen.findByText('Pagado con QR · no cobrar')).toBeInTheDocument();
  });

  /** El defecto: al marcar "en camino" se le decía "Registrado como no entregado". */
  it('al salir con un pedido avisa que va en camino, no que no se entregó', async () => {
    servidorCon(Promise.resolve({ disponible: true }), [porSalir]);
    vi.mocked(api.patch).mockResolvedValue({} as never);
    render(<PaginaEntregas />);

    await userEvent.click(await screen.findByRole('button', { name: 'Salgo con el pedido' }));

    expect(api.patch).toHaveBeenCalledWith('/gestion/pedidos/12/estado', { estado: 'En camino' });
    await waitFor(() =>
      expect(notificar).toHaveBeenCalledWith('exito', expect.stringContaining('en camino')),
    );
    expect(notificar).not.toHaveBeenCalledWith('exito', expect.stringContaining('no entregado'));
  });

  it('un pedido todavía en cocina se ve, pero no le pide nada al repartidor', async () => {
    servidorCon(Promise.resolve({ disponible: true }), [enCocina]);
    render(<PaginaEntregas />);

    expect(await screen.findByText('En cocina')).toBeInTheDocument();
    // "Poner en preparación" es trabajo de la cocina, no del repartidor.
    expect(screen.queryByRole('button', { name: /preparación/ })).toBeNull();
  });

  it('muestra primero lo que está en la calle', async () => {
    servidorCon(Promise.resolve({ disponible: true }), [enCocina, porSalir, enCamino]);
    render(<PaginaEntregas />);

    const titulos = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent);
    expect(titulos.map((t) => t?.replace(/\d+$/, '').trim())).toEqual([
      'En camino',
      'Por salir',
      'En cocina',
    ]);
  });

  it('a quien no reparte le dice que no es su pantalla, sin consultar entregas', async () => {
    cargo = 'Cocinero';
    servidorCon(Promise.resolve({ disponible: true }), [enCamino]);
    render(<PaginaEntregas />);

    expect(await screen.findByText('Esta pantalla es para repartidores')).toBeInTheDocument();
    expect(pedir).not.toHaveBeenCalled();
  });
});

describe('separarTransiciones', () => {
  it('distingue el avance del flujo de la salida que lo interrumpe', () => {
    expect(separarTransiciones(['Entregado', 'Cancelado'])).toEqual({
      avance: 'Entregado',
      salidas: ['Cancelado'],
    });
  });

  it('un pedido que solo avanza no ofrece salidas', () => {
    expect(separarTransiciones(['En preparacion'])).toEqual({
      avance: 'En preparacion',
      salidas: [],
    });
  });

  it('un pedido terminado no ofrece nada', () => {
    expect(separarTransiciones([])).toEqual({ avance: null, salidas: [] });
  });
});
