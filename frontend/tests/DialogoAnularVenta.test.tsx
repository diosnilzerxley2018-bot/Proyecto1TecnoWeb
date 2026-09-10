import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogoAnularVenta } from '@/components/ventas/DialogoAnularVenta';
import type { Venta } from '@/types';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn() },
  ErrorApi: class ErrorApi extends Error {},
}));

const enviar = vi.mocked(api.post);

function venta(cambios: Partial<Venta> = {}): Venta {
  return {
    id: 128,
    fecha: '2026-09-01T15:00:00.000Z',
    tipoVenta: 'Mesa',
    metodoPago: 'Efectivo',
    estadoPago: 'Pagado',
    total: 47.5,
    cliente: null,
    atendidoPor: { id: 1, nombreCompleto: 'Nilser Condori' },
    items: [
      {
        idProducto: 11,
        nombre: 'Jugo de gualele',
        almacen: 'Camara Refrigerada',
        cantidad: 5,
        precioUnitario: 5,
        subtotal: 25,
      },
      {
        idProducto: 11,
        nombre: 'Jugo de gualele',
        almacen: 'almacen de emergencia',
        cantidad: 2,
        precioUnitario: 5,
        subtotal: 10,
      },
    ],
    ...cambios,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('DialogoAnularVenta', () => {
  it('no se muestra si no hay venta', () => {
    const { container } = render(
      <DialogoAnularVenta venta={null} onCerrar={vi.fn()} onAnulada={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('dice cuántas unidades vuelven al inventario', () => {
    render(<DialogoAnularVenta venta={venta()} onCerrar={vi.fn()} onAnulada={vi.fn()} />);
    // 5 + 2, sumando las dos líneas que salieron de almacenes distintos.
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  /** Lo que el sistema registra y lo que entrega no son lo mismo. */
  it('avisa que el dinero no se devuelve solo cuando la venta estaba cobrada', () => {
    render(<DialogoAnularVenta venta={venta()} onCerrar={vi.fn()} onAnulada={vi.fn()} />);
    expect(screen.getByText(/no entrega el dinero/)).toBeInTheDocument();
  });

  it('no lo avisa cuando el cobro nunca entró', () => {
    render(
      <DialogoAnularVenta
        venta={venta({ estadoPago: 'Pendiente' })}
        onCerrar={vi.fn()}
        onAnulada={vi.fn()}
      />,
    );
    expect(screen.queryByText(/no entrega el dinero/)).not.toBeInTheDocument();
  });

  it('exige un motivo antes de habilitar la anulación', async () => {
    const usuario = userEvent.setup();
    render(<DialogoAnularVenta venta={venta()} onCerrar={vi.fn()} onAnulada={vi.fn()} />);

    const boton = screen.getByRole('button', { name: /Anular venta/ });
    expect(boton).toBeDisabled();

    await usuario.type(screen.getByLabelText(/Motivo/), 'El cliente se arrepintió');
    expect(boton).toBeEnabled();
  });

  it('envía el motivo y devuelve el resultado', async () => {
    const usuario = userEvent.setup();
    const alAnular = vi.fn();
    enviar.mockResolvedValue({
      venta: venta({ estadoPago: 'Anulado' }),
      requiereDevolucion: true,
      aviso: 'La venta estaba cobrada',
    });

    render(<DialogoAnularVenta venta={venta()} onCerrar={vi.fn()} onAnulada={alAnular} />);

    await usuario.type(screen.getByLabelText(/Motivo/), 'Cobro duplicado');
    await usuario.click(screen.getByRole('button', { name: /Anular venta/ }));

    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith('/ventas/128/anular', { motivo: 'Cobro duplicado' }),
    );
    expect(alAnular).toHaveBeenCalledWith(
      expect.objectContaining({ requiereDevolucion: true }),
    );
  });
});
