import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaginaEntregas from '@/app/(privado)/entregas/page';
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
  api: { get: vi.fn(), put: vi.fn() },
  ErrorApi: class extends Error {},
}));

// El permiso lo verifica el servidor; aquí interesa solo el contenido.
vi.mock('@/components/RequierePermiso', () => ({
  RequierePermiso: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const notificar = vi.fn();
vi.mock('@/components/ui/Notificaciones', () => ({
  useNotificaciones: () => ({ notificar }),
}));

const pedir = vi.mocked(api.get);
const enviar = vi.mocked(api.put);

/** Responde según la ruta, como el servidor. */
function servidorCon(turno: Promise<{ disponible: boolean }>) {
  pedir.mockImplementation((ruta: string) => {
    if (ruta === '/gestion/disponibilidad') return turno as Promise<never>;
    if (ruta === '/gestion/mis-entregas') return Promise.resolve([] as never);
    return Promise.reject(new Error(`ruta inesperada: ${ruta}`));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
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
