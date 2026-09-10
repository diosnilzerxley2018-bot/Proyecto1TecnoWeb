import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Paginacion } from '@/components/ui/Paginacion';

/**
 * Hallazgo H7 — navegación entre páginas de un listado.
 *
 * Lo que se comprueba es lo que puede confundir a quien mira: que el total sea
 * el del negocio y no el de la pantalla, y que las flechas no lleven a páginas
 * que no existen.
 */

const dibujar = (props: Partial<Parameters<typeof Paginacion>[0]> = {}) => {
  const onCambiar = vi.fn();
  render(
    <Paginacion
      pagina={2}
      paginas={5}
      total={97}
      nombre="ventas"
      onCambiar={onCambiar}
      {...props}
    />,
  );
  return { onCambiar };
};

describe('Paginacion', () => {
  /** Un control que no navega a ninguna parte solo ocupa espacio. */
  it('no se dibuja cuando hay una sola página', () => {
    dibujar({ paginas: 1, total: 8 });
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  /**
   * Sin el total, "20 ventas" en pantalla se lee como "hubo 20 ventas", que es
   * una conclusión equivocada sobre el negocio.
   */
  it('dice cuántos hay en total, no cuántos se ven', () => {
    dibujar();
    expect(screen.getByText(/97 ventas en total/)).toBeInTheDocument();
    expect(screen.getByText(/Página 2 de 5/)).toBeInTheDocument();
  });

  it('avanza y retrocede', async () => {
    const usuario = userEvent.setup();
    const { onCambiar } = dibujar();

    await usuario.click(screen.getByLabelText('Página siguiente'));
    expect(onCambiar).toHaveBeenCalledWith(3);

    await usuario.click(screen.getByLabelText('Página anterior'));
    expect(onCambiar).toHaveBeenCalledWith(1);
  });

  it('en la primera página no se puede retroceder', () => {
    dibujar({ pagina: 1 });
    expect(screen.getByLabelText('Página anterior')).toBeDisabled();
    expect(screen.getByLabelText('Página siguiente')).toBeEnabled();
  });

  it('en la última no se puede avanzar', () => {
    dibujar({ pagina: 5 });
    expect(screen.getByLabelText('Página siguiente')).toBeDisabled();
    expect(screen.getByLabelText('Página anterior')).toBeEnabled();
  });

  it('nombra el listado que pagina, para quien navega con lector de pantalla', () => {
    dibujar({ nombre: 'pedidos' });
    expect(screen.getByRole('navigation', { name: 'Páginas de pedidos' })).toBeInTheDocument();
  });
});
