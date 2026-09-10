import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuscadorSitio } from '@/components/portal/BuscadorSitio';
import type { BusquedaSitio } from '@/types';

/**
 * RF-PED-03 — *"buscar productos e información del negocio desde el encabezado
 * de la página principal"*.
 *
 * Una sola caja para las dos cosas. Lo que se comprueba es que encuentre las
 * dos, que las distinga al llevar a cada una a su sitio, y que no dispare una
 * consulta por tecla.
 */

const empujar = vi.fn();

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
  ErrorApi: class ErrorApi extends Error {},
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: empujar }),
}));

const { api } = await import('@/lib/api');
const consultar = vi.mocked(api.get);

const RESPUESTA: BusquedaSitio = {
  termino: 'avena',
  resultados: [
    { tipo: 'producto', titulo: 'Barra de avena', detalle: 'Bs 12.00', idProducto: 3 },
    {
      tipo: 'informacion',
      titulo: 'Horario de atención',
      detalle: 'Lunes a sábado de 08:00 a 20:00',
      idProducto: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  consultar.mockResolvedValue(RESPUESTA);
});

afterEach(() => vi.useRealTimers());

const caja = () => screen.getByLabelText('Buscar productos e información');

describe('BuscadorSitio', () => {
  it('no consulta nada mientras el campo está vacío', async () => {
    render(<BuscadorSitio />);
    await new Promise((r) => setTimeout(r, 400));
    expect(consultar).not.toHaveBeenCalled();
  });

  it('consulta el término escrito', async () => {
    const usuario = userEvent.setup();
    render(<BuscadorSitio />);

    await usuario.type(caja(), 'avena');

    await waitFor(() => expect(consultar).toHaveBeenCalled());
    expect(consultar.mock.calls.at(-1)?.[0]).toContain('/negocio/buscar?termino=avena');
  });

  /** Una consulta por tecla convierte cinco letras en cinco peticiones. */
  it('espera a que se deje de escribir antes de consultar', async () => {
    const usuario = userEvent.setup();
    render(<BuscadorSitio />);

    await usuario.type(caja(), 'ensalada');

    await waitFor(() => expect(consultar).toHaveBeenCalled());
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it('muestra los productos y la información en la misma lista', async () => {
    const usuario = userEvent.setup();
    render(<BuscadorSitio />);

    await usuario.type(caja(), 'avena');

    expect(await screen.findByText('Barra de avena')).toBeInTheDocument();
    expect(screen.getByText('Horario de atención')).toBeInTheDocument();
    expect(screen.getByText('Bs 12.00')).toBeInTheDocument();
  });

  /** Cada tipo va a un sitio distinto: el producto al catálogo, el dato a la ficha. */
  it('lleva al catálogo filtrado cuando se elige un producto', async () => {
    const usuario = userEvent.setup();
    render(<BuscadorSitio />);

    await usuario.type(caja(), 'avena');
    await usuario.click(await screen.findByText('Barra de avena'));

    expect(empujar).toHaveBeenCalledWith('/portal?termino=Barra%20de%20avena');
  });

  it('lleva a la página de información cuando se elige un dato del negocio', async () => {
    const usuario = userEvent.setup();
    render(<BuscadorSitio />);

    await usuario.type(caja(), 'avena');
    await usuario.click(await screen.findByText('Horario de atención'));

    expect(empujar).toHaveBeenCalledWith('/portal/nosotros');
  });

  it('vacía la caja después de elegir un resultado', async () => {
    const usuario = userEvent.setup();
    render(<BuscadorSitio />);

    await usuario.type(caja(), 'avena');
    await usuario.click(await screen.findByText('Barra de avena'));

    expect(caja()).toHaveValue('');
  });

  it('dice que no hay coincidencias en vez de dejar el panel vacío', async () => {
    consultar.mockResolvedValue({ termino: 'zzz', resultados: [] });
    const usuario = userEvent.setup();
    render(<BuscadorSitio />);

    await usuario.type(caja(), 'zzz');

    expect(await screen.findByText(/Nada coincide/)).toBeInTheDocument();
  });

  /** Un buscador caído no puede impedir seguir navegando el portal. */
  it('un fallo de la API no rompe la pantalla', async () => {
    consultar.mockRejectedValue(new Error('sin red'));
    const usuario = userEvent.setup();
    render(<BuscadorSitio />);

    await usuario.type(caja(), 'avena');

    expect(await screen.findByText(/Nada coincide/)).toBeInTheDocument();
    expect(caja()).toHaveValue('avena');
  });

  it('el botón de borrar limpia la búsqueda', async () => {
    const usuario = userEvent.setup();
    render(<BuscadorSitio />);

    await usuario.type(caja(), 'avena');
    await usuario.click(screen.getByLabelText('Borrar la búsqueda'));

    expect(caja()).toHaveValue('');
    expect(screen.queryByText('Barra de avena')).not.toBeInTheDocument();
  });
});
