import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogoComprobante } from '@/components/pedidos/DialogoComprobante';
import type { ComprobantePedido } from '@/types';

/**
 * El comprobante del pedido pagado (RF-VEN-06 llevado al portal): el mismo
 * tique que el del mostrador, con el correo de soporte y los botones para
 * mandarlo al correo o descargarlo.
 */

const notificar = vi.fn();

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), descargar: vi.fn() },
  ErrorApi: class ErrorApi extends Error {
    constructor(
      public readonly estado: number,
      mensaje: string,
    ) {
      super(mensaje);
    }
  },
}));
vi.mock('@/components/ui/Notificaciones', () => ({
  useNotificaciones: () => ({ notificar }),
}));

const { api, ErrorApi } = await import('@/lib/api');
const consultar = vi.mocked(api.get);
const enviar = vi.mocked(api.post);

const COMPROBANTE: ComprobantePedido = {
  numero: 'Pedido #00030',
  fecha: '2026-09-29T00:58:27.000Z',
  pagadoEn: '2026-09-29T00:58:49.000Z',
  cliente: 'nilser cliente',
  entrega: 'Avenida Banzer 1200 · Portón verde',
  metodoPago: 'QR',
  referenciaPago: '1b3b29a2-d0ae-4204-8627-b577a142d5b8',
  detalle: [{ idProducto: 7, nombre: 'Wrap integral de pollo', cantidad: 1, precioUnitario: 38, subtotal: 38 }],
  cantidadItems: 1,
  total: 38,
  soporte: 'nutriexpress2026@gmail.com',
};

beforeEach(() => {
  vi.clearAllMocks();
  consultar.mockResolvedValue(COMPROBANTE as never);
});

describe('DialogoComprobante', () => {
  it('muestra el tique del pedido con el contacto de soporte', async () => {
    render(<DialogoComprobante idPedido={30} onCerrar={vi.fn()} />);

    expect(await screen.findByText('Pedido #00030')).toBeInTheDocument();
    expect(consultar).toHaveBeenCalledWith('/pedidos/30/comprobante');
    expect(screen.getByText('Comprobante de pago')).toBeInTheDocument();
    expect(screen.getByText('Wrap integral de pollo')).toBeInTheDocument();
    expect(screen.getByText('Soporte: nutriexpress2026@gmail.com')).toBeInTheDocument();
    // Solo al abrirse por un pago recién hecho se confirma el pago arriba.
    expect(screen.queryByText(/Pago acreditado/)).not.toBeInTheDocument();
  });

  it('tras pagar, confirma el pago y avisa que la copia va al correo', async () => {
    render(<DialogoComprobante idPedido={30} recienPagado onCerrar={vi.fn()} />);

    expect(await screen.findByText(/Pago acreditado/)).toBeInTheDocument();
    expect(screen.getByText(/Le enviamos una copia/)).toBeInTheDocument();
  });

  it('«Enviar a mi correo» dice a qué correo lo mandó', async () => {
    enviar.mockResolvedValue({ enviado: true, para: 'nilserrodrigocondoriortiz@gmail.com' } as never);
    render(<DialogoComprobante idPedido={30} onCerrar={vi.fn()} />);
    await screen.findByText('Pedido #00030');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar a mi correo' }));

    expect(enviar).toHaveBeenCalledWith('/pedidos/30/comprobante/enviar');
    await waitFor(() =>
      expect(notificar).toHaveBeenCalledWith(
        'exito',
        'Comprobante enviado a nilserrodrigocondoriortiz@gmail.com',
      ),
    );
  });

  it('si el correo no salió, lo dice en vez de darlo por enviado', async () => {
    enviar.mockResolvedValue({ enviado: false, para: 'x@correo.bo', motivo: 'Buzón inexistente' } as never);
    render(<DialogoComprobante idPedido={30} onCerrar={vi.fn()} />);
    await screen.findByText('Pedido #00030');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar a mi correo' }));

    await waitFor(() => expect(notificar).toHaveBeenCalledWith('error', 'Buzón inexistente'));
  });

  it('un pedido sin pagar explica por qué no tiene comprobante', async () => {
    consultar.mockRejectedValue(
      new ErrorApi(409, 'El comprobante se emite al pagar: en efectivo, cuando recibe su pedido.'),
    );
    render(<DialogoComprobante idPedido={31} onCerrar={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('cuando recibe su pedido');
    expect(screen.getByRole('button', { name: 'Enviar a mi correo' })).toBeDisabled();
  });
});
