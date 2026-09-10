import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PanelModoCobro } from '@/components/ajustes/PanelModoCobro';
import type { EstadoCobro } from '@/types';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn() },
  ErrorApi: class ErrorApi extends Error {},
}));

const notificar = vi.fn();
vi.mock('@/components/ui/Notificaciones', () => ({
  useNotificaciones: () => ({ notificar }),
}));

const pedir = vi.mocked(api.get);
const guardar = vi.mocked(api.put);

const estado = (cambios: Partial<EstadoCobro> = {}): EstadoCobro => ({
  modo: 'Simulado',
  pasarela: 'Simulada',
  pasarelaReal: 'Libelula',
  operativa: true,
  actualizadoEn: '2026-09-01T10:00:00.000Z',
  actualizadoPor: 'Nilser Rodrigo Condori Ortiz',
  pasarelasDisponibles: ['Libelula'],
  ...cambios,
});

beforeEach(() => vi.clearAllMocks());

describe('PanelModoCobro', () => {
  it('muestra el modo vigente y quién lo cambió', async () => {
    pedir.mockResolvedValue(estado());
    render(<PanelModoCobro />);

    expect(await screen.findByText(/Pasarela: Simulada/)).toBeInTheDocument();
    // El modo vigente aparece dos veces: en la insignia y en su tarjeta.
    expect(screen.getAllByText('Simulado').length).toBeGreaterThan(1);
    expect(screen.getByText(/Nilser Rodrigo Condori Ortiz/)).toBeInTheDocument();
  });

  /**
   * Activar dinero real no puede ser un clic distraído: media un diálogo que
   * dice, sin rodeos, qué va a pasar a partir de ese momento.
   */
  it('pide confirmación explícita antes de activar el dinero real', async () => {
    const usuario = userEvent.setup();
    pedir.mockResolvedValue(estado());
    guardar.mockResolvedValue(estado({ modo: 'Real', pasarela: 'Libelula' }));

    render(<PanelModoCobro />);
    await screen.findByText(/Pasarela: Simulada/);

    await usuario.click(screen.getByRole('button', { name: /Dinero real/ }));

    expect(screen.getByText(/cobrar dinero de verdad/)).toBeInTheDocument();
    // Debe nombrar a quién va a cobrar, no a quién cobra hoy.
    expect(screen.getByText(/a través de Libelula/)).toBeInTheDocument();
    expect(screen.queryByText(/a través de Simulada/)).not.toBeInTheDocument();
    // Todavía no se guardó nada.
    expect(guardar).not.toHaveBeenCalled();

    await usuario.click(screen.getByRole('button', { name: 'Sí, cobrar dinero real' }));

    await waitFor(() => expect(guardar).toHaveBeenCalledWith('/configuracion/cobro', {
      modo: 'Real',
    }));
  });

  it('cancelar el diálogo no cambia el modo', async () => {
    const usuario = userEvent.setup();
    pedir.mockResolvedValue(estado());

    render(<PanelModoCobro />);
    await screen.findByText(/Pasarela: Simulada/);

    await usuario.click(screen.getByRole('button', { name: /Dinero real/ }));
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(guardar).not.toHaveBeenCalled();
  });

  it('no permite volver a elegir el modo que ya está activo', async () => {
    pedir.mockResolvedValue(estado());
    render(<PanelModoCobro />);
    await screen.findByText(/Pasarela: Simulada/);

    expect(screen.getByRole('button', { name: /Simulado/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Dinero real/ })).toBeEnabled();
  });

  /** El peor escenario es estar en real y descubrirlo con un cliente esperando. */
  it('advierte cuando el modo real está activo pero la pasarela no puede operar', async () => {
    pedir.mockResolvedValue(
      estado({
        modo: 'Real',
        pasarela: 'Libelula',
        operativa: false,
        advertencia: 'El modo real está activo pero faltan credenciales de la pasarela.',
      }),
    );

    render(<PanelModoCobro />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/faltan credenciales/);
  });
});
