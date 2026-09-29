import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaginaRecuperar from '@/app/recuperar/page';

/**
 * «Olvidé mi contraseña»: pedir el código, escribirlo y elegir la nueva.
 */

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
  ErrorApi: class ErrorApi extends Error {
    constructor(
      public readonly estado: number,
      mensaje: string,
    ) {
      super(mensaje);
    }
  },
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ sesion: null, cargando: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
// El pie y el selector de tema no son lo que se prueba aquí.
vi.mock('@/components/ui/PieVisitas', () => ({ PieVisitas: () => null }));
vi.mock('@/components/ui/SelectorTema', () => ({ SelectorTema: () => null }));

const { api, ErrorApi } = await import('@/lib/api');
const enviar = vi.mocked(api.post);

const MENSAJE = 'Si hay una cuenta con ese dato, le enviamos un código a su correo.';

beforeEach(() => {
  vi.clearAllMocks();
  enviar.mockImplementation((ruta: string) => {
    if (ruta === '/auth/recuperar') return Promise.resolve({ mensaje: MENSAJE } as never);
    if (ruta === '/auth/recuperar/verificar') return Promise.resolve({ valido: true } as never);
    if (ruta === '/auth/recuperar/restablecer') return Promise.resolve({ mensaje: 'ok' } as never);
    return Promise.reject(new Error(`ruta inesperada: ${ruta}`));
  });
});

describe('Recuperar la contraseña', () => {
  it('pide el código, lo confirma y cambia la contraseña', async () => {
    const usuario = userEvent.setup();
    render(<PaginaRecuperar />);

    await usuario.type(screen.getByLabelText('Correo o nombre de usuario'), 'admin');
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));
    expect(enviar).toHaveBeenCalledWith('/auth/recuperar', { identificador: 'admin' });
    expect(await screen.findByText(MENSAJE)).toBeInTheDocument();
    // Recién pedido, no se puede reenviar enseguida.
    expect(screen.getByRole('button', { name: /Reenviar código en \d+ s/ })).toBeDisabled();

    await usuario.type(screen.getByLabelText('Código'), '123456');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(enviar).toHaveBeenCalledWith('/auth/recuperar/verificar', {
      identificador: 'admin',
      codigo: '123456',
    });

    const nueva = await screen.findByLabelText('Contraseña nueva');
    // Mientras no cumpla la política, no se puede enviar.
    await usuario.type(nueva, 'corta');
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeDisabled();
    // Pegadas y no tecleadas: tecla por tecla, con la suite en paralelo, el
    // recorrido pasaba el límite de tiempo sin que nada fallara.
    await usuario.clear(nueva);
    await usuario.paste('Recuperada2026!');
    await usuario.click(screen.getByLabelText('Repetir la nueva'));
    await usuario.paste('Recuperada2026!');
    await usuario.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(enviar).toHaveBeenCalledWith('/auth/recuperar/restablecer', {
      identificador: 'admin',
      codigo: '123456',
      contrasena: 'Recuperada2026!',
    });
    expect(await screen.findByText(/Su contraseña fue cambiada/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
  }, 30_000);

  it('un código equivocado se dice con los intentos que quedan', async () => {
    enviar.mockImplementation((ruta: string) =>
      ruta === '/auth/recuperar/verificar'
        ? Promise.reject(new ErrorApi(400, 'El código no es correcto. Le quedan 4 intento(s).'))
        : Promise.resolve({ mensaje: MENSAJE } as never),
    );
    const usuario = userEvent.setup();
    render(<PaginaRecuperar />);

    await usuario.type(screen.getByLabelText('Correo o nombre de usuario'), 'admin');
    await usuario.click(screen.getByRole('button', { name: 'Enviar código' }));
    await usuario.type(await screen.findByLabelText('Código'), '000000');
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Le quedan 4 intento(s)');
    // Sigue en el paso del código: puede corregirlo.
    expect(screen.getByLabelText('Código')).toBeInTheDocument();
  });
});
