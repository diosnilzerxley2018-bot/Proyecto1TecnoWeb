import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CambiarContrasena } from '@/components/perfil/CambiarContrasena';

vi.mock('@/lib/api', () => ({
  api: { put: vi.fn() },
  ErrorApi: class ErrorApi extends Error {},
}));

vi.mock('@/components/ui/Notificaciones', () => ({
  useNotificaciones: () => ({ notificar: vi.fn() }),
}));

const { api } = await import('@/lib/api');
const enviar = vi.mocked(api.put);

beforeEach(() => vi.clearAllMocks());

const campos = () => ({
  actual: screen.getByLabelText(/Contraseña actual/),
  nueva: screen.getByLabelText(/Contraseña nueva/),
  repetir: screen.getByLabelText(/Repetir la nueva/),
  boton: screen.getByRole('button', { name: /Cambiar/ }),
});

describe('CambiarContrasena', () => {
  it('nace deshabilitado: no hay nada que enviar', () => {
    render(<CambiarContrasena />);
    expect(campos().boton).toBeDisabled();
  });

  /** Una política que solo se conoce al fallar obliga a adivinar. */
  it('muestra los requisitos mientras se escribe', async () => {
    const usuario = userEvent.setup();
    render(<CambiarContrasena />);

    expect(screen.queryByText('Una mayúscula')).not.toBeInTheDocument();

    await usuario.type(campos().nueva, 'a');
    expect(screen.getByText('Al menos 8 caracteres')).toBeInTheDocument();
    expect(screen.getByText('Un carácter especial')).toBeInTheDocument();
  });

  it('no deja enviar una contraseña que incumple la política', async () => {
    const usuario = userEvent.setup();
    render(<CambiarContrasena />);
    const c = campos();

    await usuario.type(c.actual, 'Actual1234!');
    await usuario.type(c.nueva, 'simple');
    await usuario.type(c.repetir, 'simple');

    expect(c.boton).toBeDisabled();
  });

  it('avisa cuando la repetición no coincide', async () => {
    const usuario = userEvent.setup();
    render(<CambiarContrasena />);
    const c = campos();

    await usuario.type(c.nueva, 'ClaveNueva1!');
    await usuario.type(c.repetir, 'ClaveNueva2!');

    expect(screen.getByText('No coinciden')).toBeInTheDocument();
    expect(c.boton).toBeDisabled();
  });

  it('no deja repetir la contraseña que ya tenía', async () => {
    const usuario = userEvent.setup();
    render(<CambiarContrasena />);
    const c = campos();
    const misma = 'ClaveIgual1!';

    await usuario.type(c.actual, misma);
    await usuario.type(c.nueva, misma);
    await usuario.type(c.repetir, misma);

    expect(screen.getByText(/debe ser distinta de la actual/)).toBeInTheDocument();
    expect(c.boton).toBeDisabled();
  });

  it('envía la actual y la nueva, y limpia el formulario', async () => {
    const usuario = userEvent.setup();
    enviar.mockResolvedValue(undefined);
    render(<CambiarContrasena />);
    const c = campos();

    await usuario.type(c.actual, 'Actual1234!');
    await usuario.type(c.nueva, 'NuevaClave1!');
    await usuario.type(c.repetir, 'NuevaClave1!');
    await usuario.click(c.boton);

    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith('/perfil/contrasena', {
        contrasenaActual: 'Actual1234!',
        contrasenaNueva: 'NuevaClave1!',
      }),
    );
    await waitFor(() => expect(campos().actual).toHaveValue(''));
  });

  /** El usuario debe saber que su otra sesión sigue abierta. */
  it('advierte que las demás sesiones siguen activas', () => {
    render(<CambiarContrasena />);
    expect(screen.getByText(/sesiones abiertas en otros dispositivos/i)).toBeInTheDocument();
  });
});
