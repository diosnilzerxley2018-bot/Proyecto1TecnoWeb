import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaginaLotes from '@/app/(privado)/inventario/lotes/page';

/**
 * Inventario › Lotes: cada ingreso es un lote, con lo que costó la unidad.
 * El ejemplo: el aceite se compró a Bs 12 y después a Bs 15.
 */

const notificar = vi.fn();

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
  ErrorApi: class ErrorApi extends Error {},
}));
vi.mock('@/components/ui/Notificaciones', () => ({
  useNotificaciones: () => ({ notificar }),
}));

const { api } = await import('@/lib/api');
const consultar = vi.mocked(api.get);

const linea = (costoUnitario: number, extra: object = {}) => ({
  tipo: 'insumo',
  id: 5,
  nombre: 'Aceite de girasol',
  unidad: 'L',
  idAlmacen: 1,
  almacen: 'Almacen Seco',
  cantidad: 5,
  costoUnitario,
  subtotal: 5 * costoUnitario,
  lote: null,
  ...extra,
});

const NOTAS = {
  datos: [
    {
      id: 12,
      fecha: '2026-09-29T14:00:00.000Z',
      motivo: 'Compra',
      proveedor: 'Distribuidora Sur',
      numeroDocumento: 'F-101',
      total: 225,
      registradoPor: { id: 1, nombreCompleto: 'Admin' },
      lineas: [
        linea(15),
        {
          ...linea(6),
          id: 9,
          nombre: 'Leche entera',
          cantidad: 25,
          subtotal: 150,
          lote: { codigo: 'L-7', vencimiento: '2026-10-09', queda: 20 },
        },
      ],
    },
  ],
  pagina: 1,
  porPagina: 20,
  total: 1,
  paginas: 1,
};

const LOTES = {
  datos: [
    { ...linea(15), idNota: 12, fecha: '2026-09-29T14:00:00.000Z', motivo: 'Compra', proveedor: 'Distribuidora Sur', numeroDocumento: 'F-101' },
    { ...linea(12), idNota: 8, fecha: '2026-09-20T14:00:00.000Z', motivo: 'Compra', proveedor: 'Distribuidora Sur', numeroDocumento: 'F-100' },
  ],
  pagina: 1,
  porPagina: 20,
  total: 2,
  paginas: 1,
  resumen: [
    {
      tipo: 'insumo',
      id: 5,
      nombre: 'Aceite de girasol',
      unidad: 'L',
      lotes: 2,
      cantidad: 10,
      costoMinimo: 12,
      costoMaximo: 15,
      costoUltimo: 15,
      costoActual: 13.5,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  consultar.mockImplementation((ruta: string) =>
    Promise.resolve((ruta.startsWith('/ingresos/lotes') ? LOTES : NOTAS) as never),
  );
});

describe('Inventario › Lotes', () => {
  it('por lote: la nota con lo que entró junto, al precio de esa entrada', async () => {
    render(<PaginaLotes />);

    const tarjeta = (await screen.findByText('Lote ING-0012')).closest('li')!;
    expect(within(tarjeta).getByText(/Distribuidora Sur · F-101/)).toBeInTheDocument();
    expect(within(tarjeta).getByText('Bs 15,00')).toBeInTheDocument();
    // El perecedero dice su lote, cuándo vence y cuánto queda.
    expect(within(tarjeta).getByText(/Lote L-7 · vence 09\/10\/2026/)).toBeInTheDocument();
    expect(within(tarjeta).getByText('quedan 20 L')).toBeInTheDocument();
    expect(consultar).toHaveBeenCalledWith('/ingresos?pagina=1');
  });

  it('por ítem: cada entrada con su costo unitario, y cuánto varió el precio', async () => {
    const usuario = userEvent.setup();
    render(<PaginaLotes />);
    await screen.findByText('Lote ING-0012');

    await usuario.click(screen.getByRole('button', { name: 'Por ítem' }));

    expect(await screen.findByText('Bs 12,00 a Bs 15,00')).toBeInTheDocument();
    expect(screen.getByText('Último lote: Bs 15,00 · Costo actual: Bs 13,50')).toBeInTheDocument();
    expect(screen.getByText('ING-0008')).toBeInTheDocument();
    expect(consultar).toHaveBeenLastCalledWith('/ingresos/lotes?pagina=1');
  });

  it('filtra por rango de fechas', async () => {
    render(<PaginaLotes />);
    await screen.findByText('Lote ING-0012');

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } });

    await waitFor(() =>
      expect(consultar).toHaveBeenLastCalledWith(
        '/ingresos?pagina=1&desde=2026-09-01&hasta=2026-09-30',
      ),
    );
  });

  it('busca por nombre en el servidor, después de dejar de escribir', async () => {
    const usuario = userEvent.setup();
    render(<PaginaLotes />);
    await screen.findByText('Lote ING-0012');

    await usuario.type(screen.getByLabelText('Buscar insumo o producto'), 'aceite');

    await waitFor(() =>
      expect(consultar).toHaveBeenLastCalledWith('/ingresos?pagina=1&termino=aceite'),
    );
  });
});
