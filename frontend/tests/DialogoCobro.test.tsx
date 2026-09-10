import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogoCobro } from '@/components/ventas/DialogoCobro';
import type { Pago } from '@/types';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  ErrorApi: class extends Error {},
}));

const pedir = vi.mocked(api.get);
const enviar = vi.mocked(api.post);

function pago(cambios: Partial<Pago> = {}): Pago {
  return {
    id: 7,
    monto: 47.5,
    moneda: 'BOB',
    metodo: 'QR',
    estado: 'Pendiente',
    modo: 'Simulado',
    pasarela: 'Simulada',
    referenciaExterna: 'SIM-abc',
    datosCobro: 'NUTRIEXPRESS-SIMULADO|monto=47.50',
    tipoDatos: 'qr',
    qrImagen: 'data:image/png;base64,iVBORw0KGgo=',
    expiraEn: new Date(Date.now() + 900_000).toISOString(),
    confirmadoEn: null,
    idVenta: 128,
    idPedido: null,
    simulado: true,
    ...cambios,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DialogoCobro', () => {
  it('no se muestra si no hay cobro', () => {
    const { container } = render(
      <DialogoCobro pago={null} onCerrar={vi.fn()} onPagado={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra el código y el monto, y avisa que no se cobra dinero real', () => {
    render(<DialogoCobro pago={pago()} onCerrar={vi.fn()} onPagado={vi.fn()} />);

    expect(screen.getByAltText('Código QR para pagar')).toBeInTheDocument();
    expect(screen.getByText(/no se está cobrando dinero real/)).toBeInTheDocument();
    expect(screen.getByText(/Esperando la confirmación del pago/)).toBeInTheDocument();
  });

  /**
   * Es la garantía de fondo: la interfaz nunca decide que algo se pagó, lo
   * pregunta. Sin esto podría dar por cobrado lo que no entró.
   */
  it('pregunta al servidor y avisa cuando el pago se acredita', async () => {
    const alPagar = vi.fn();
    pedir.mockResolvedValue(pago({ estado: 'Pagado', confirmadoEn: new Date().toISOString() }));

    render(<DialogoCobro pago={pago()} onCerrar={vi.fn()} onPagado={alPagar} />);

    await vi.advanceTimersByTimeAsync(3000);

    await waitFor(() => expect(alPagar).toHaveBeenCalledTimes(1));
    expect(pedir).toHaveBeenCalledWith('/pagos/7');
    expect(await screen.findByText('Pago recibido')).toBeInTheDocument();
  });

  it('deja de preguntar una vez acreditado, y avisa una sola vez', async () => {
    const alPagar = vi.fn();
    pedir.mockResolvedValue(pago({ estado: 'Pagado' }));

    render(<DialogoCobro pago={pago()} onCerrar={vi.fn()} onPagado={alPagar} />);

    await vi.advanceTimersByTimeAsync(3000);
    await waitFor(() => expect(alPagar).toHaveBeenCalledTimes(1));

    const consultasAlAcreditar = pedir.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);

    expect(pedir).toHaveBeenCalledTimes(consultasAlAcreditar);
    expect(alPagar).toHaveBeenCalledTimes(1);
  });

  it('explica cuando el cobro venció', () => {
    render(
      <DialogoCobro pago={pago({ estado: 'Vencido' })} onCerrar={vi.fn()} onPagado={vi.fn()} />,
    );
    expect(screen.getByText('El plazo del cobro venció')).toBeInTheDocument();
    expect(screen.queryByAltText('Código QR para pagar')).not.toBeInTheDocument();
  });

  /** El camino del QR estático: alguien verifica en su banco y confirma. */
  it('permite al mostrador confirmar un pago que verificó', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    enviar.mockResolvedValue(pago({ estado: 'Pagado' }));
    pedir.mockResolvedValue(pago());

    render(
      <DialogoCobro
        pago={pago()}
        permiteConfirmarManual
        onCerrar={vi.fn()}
        onPagado={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole('button', { name: 'Ya me pagó' }));

    expect(enviar).toHaveBeenCalledWith('/pagos/7/confirmar', {});
    expect(await screen.findByText('Pago recibido')).toBeInTheDocument();
  });

  it('el cliente no ve el botón de confirmación manual', () => {
    render(<DialogoCobro pago={pago()} onCerrar={vi.fn()} onPagado={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Ya me pagó' })).not.toBeInTheDocument();
  });

  it('ofrece el enlace cuando la pasarela devuelve un checkout y no un QR', () => {
    render(
      <DialogoCobro
        pago={pago({
          metodo: 'Tarjeta',
          tipoDatos: 'url',
          datosCobro: 'https://pasarela.example/pagar/abc',
          qrImagen: undefined,
        })}
        onCerrar={vi.fn()}
        onPagado={vi.fn()}
      />,
    );

    const enlace = screen.getByRole('link', { name: /Abrir la página de pago/ });
    expect(enlace).toHaveAttribute('href', 'https://pasarela.example/pagar/abc');
  });
});
