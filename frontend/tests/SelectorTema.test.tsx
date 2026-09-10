import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectorTema } from '@/components/ui/SelectorTema';
import { TemaProvider } from '@/context/TemaContext';

/** Reproduce la barra lateral, que recortaba el panel por abajo. */
function DentroDeBarraLateral({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: 300, overflow: 'hidden' }} data-testid="barra-lateral">
      <div style={{ marginTop: 250 }}>{children}</div>
    </div>
  );
}

function montar() {
  return render(
    <TemaProvider>
      <DentroDeBarraLateral>
        <SelectorTema />
      </DentroDeBarraLateral>
    </TemaProvider>,
  );
}

describe('SelectorTema (RF-WEB-02)', () => {
  it('ofrece los tres temas y los tres modos', async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByRole('button', { name: /apariencia/i }));

    for (const etiqueta of ['Niños', 'Jóvenes', 'Adultos', 'Automático', 'Día', 'Noche']) {
      expect(screen.getByText(etiqueta)).toBeInTheDocument();
    }
  });

  it('se dibuja fuera del contenedor que lo recortaba', async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByRole('button', { name: /apariencia/i }));

    const panel = screen.getByRole('dialog', { name: /apariencia/i });
    expect(screen.getByTestId('barra-lateral')).not.toContainElement(panel);
    expect(panel).toHaveStyle({ position: 'fixed' });
  });

  it('aplica el tema elegido al documento', async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByRole('button', { name: /apariencia/i }));
    await usuario.click(screen.getByText('Niños'));

    await waitFor(() => expect(document.documentElement.dataset.tema).toBe('ninos'));
  });

  it('una elección manual de modo desactiva la automática', async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByRole('button', { name: /apariencia/i }));
    await usuario.click(screen.getByText('Día'));

    await waitFor(() => expect(document.documentElement.dataset.modo).toBe('dia'));
  });

  it('se cierra al pulsar fuera', async () => {
    const usuario = userEvent.setup();
    render(
      <TemaProvider>
        <SelectorTema />
        <button>Otro control</button>
      </TemaProvider>,
    );

    await usuario.click(screen.getByRole('button', { name: /apariencia/i }));
    expect(screen.getByRole('dialog', { name: /apariencia/i })).toBeInTheDocument();

    await usuario.click(screen.getByText('Otro control'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /apariencia/i })).not.toBeInTheDocument(),
    );
  });
});
