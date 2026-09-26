import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotonBuscar, ProveedorBuscador } from '@/components/buscador/BuscadorGeneral';
import type { BusquedaGeneral } from '@/types';

/**
 * Buscador general del escritorio del personal.
 *
 * Lo que se comprueba es lo que lo hace útil: que se abra desde cualquier
 * pantalla, que encuentre pantallas sin esperar al servidor, que un número
 * busque pedidos, que lleve a cada cosa a su sitio y que no ofrezca lo que los
 * permisos no dejan abrir.
 */

const empujar = vi.fn();

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
  ErrorApi: class ErrorApi extends Error {},
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: empujar }),
}));

let permisos = new Set<string>();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    sesion: { usuario: { id: 1, cargo: 'Administrador' } },
    tienePermiso: (p: string) => permisos.has(p),
  }),
}));

const { api } = await import('@/lib/api');
const consultar = vi.mocked(api.get);

const PEDIDO_12: BusquedaGeneral = {
  termino: '#12',
  resultados: [
    {
      tipo: 'pedido',
      id: 12,
      titulo: 'Pedido #12',
      detalle: 'Camila Cliente',
      estado: 'En camino',
      monto: 45,
      fecha: '2026-09-20T15:00:00.000Z',
      referencia: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  permisos = new Set(['PEDIDO_LEER', 'VENTA_LEER', 'VENTA_REGISTRAR', 'STOCK_CONSULTAR']);
  consultar.mockResolvedValue({ termino: '', resultados: [] });
});

function dibujar() {
  render(
    <ProveedorBuscador>
      <BotonBuscar />
    </ProveedorBuscador>,
  );
}

const caja = () => screen.getByRole('combobox', { name: 'Buscar en el sistema' });

describe('BuscadorGeneral', () => {
  it('se abre con Ctrl+K desde cualquier pantalla y se cierra con Escape', async () => {
    const usuario = userEvent.setup();
    dibujar();

    await usuario.keyboard('{Control>}k{/Control}');
    expect(caja()).toHaveFocus();

    await usuario.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('encuentra pantallas por su nombre o por lo que se hace en ellas, sin preguntar al servidor', async () => {
    const usuario = userEvent.setup();
    dibujar();
    await usuario.click(screen.getByRole('button', { name: /Buscar/ }));

    await usuario.type(caja(), 'cobrar');

    expect(screen.getByRole('option', { name: /Punto de venta/ })).toBeInTheDocument();
    await usuario.keyboard('{Enter}');
    expect(empujar).toHaveBeenCalledWith('/ventas/registro');
  });

  it('no ofrece pantallas que los permisos no dejan abrir', async () => {
    permisos.delete('VENTA_REGISTRAR');
    const usuario = userEvent.setup();
    dibujar();
    await usuario.click(screen.getByRole('button', { name: /Buscar/ }));

    await usuario.type(caja(), 'punto de venta');

    expect(screen.queryByRole('option', { name: /Punto de venta/ })).not.toBeInTheDocument();
  });

  it('un número busca el pedido y lleva a su panel', async () => {
    consultar.mockResolvedValue(PEDIDO_12);
    const usuario = userEvent.setup();
    dibujar();
    await usuario.click(screen.getByRole('button', { name: /Buscar/ }));

    await usuario.type(caja(), '#12');

    const opcion = await screen.findByRole('option', { name: /Pedido #12/ });
    expect(consultar).toHaveBeenLastCalledWith('/buscar?q=%2312');
    // El estado con el mismo nombre que en su pantalla, y el importe formateado.
    expect(opcion).toHaveTextContent('En camino');
    expect(opcion).toHaveTextContent('45,00');

    await usuario.keyboard('{Enter}');
    expect(empujar).toHaveBeenCalledWith('/pedidos/lista?pedido=12');
  });

  it('una sola letra no le pregunta nada al servidor', async () => {
    const usuario = userEvent.setup();
    dibujar();
    await usuario.click(screen.getByRole('button', { name: /Buscar/ }));

    await usuario.type(caja(), 'a');
    await new Promise((r) => setTimeout(r, 400));

    expect(consultar).not.toHaveBeenCalled();
  });

  it('se recorre con las flechas', async () => {
    const usuario = userEvent.setup();
    dibujar();
    await usuario.click(screen.getByRole('button', { name: /Buscar/ }));

    // «reportes» coincide con varias pantallas: la segunda se elige con ↓.
    await usuario.type(caja(), 'reportes');
    const opciones = screen.getAllByRole('option');
    expect(opciones.length).toBeGreaterThan(1);

    await usuario.keyboard('{ArrowDown}{Enter}');
    expect(empujar).toHaveBeenCalledTimes(1);
    expect(opciones[1]).toHaveTextContent('Reportes');
  });

  it('dice cuando nada coincide', async () => {
    const usuario = userEvent.setup();
    dibujar();
    await usuario.click(screen.getByRole('button', { name: /Buscar/ }));

    await usuario.type(caja(), 'zzzz');

    expect(await screen.findByText('Nada coincide con «zzzz»')).toBeInTheDocument();
  });
});
