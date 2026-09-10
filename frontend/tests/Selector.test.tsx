import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Selector, type Opcion } from '@/components/ui/Selector';

const ALMACENES: Opcion<number>[] = [
  { valor: 1, etiqueta: 'Almacen Seco', descripcion: 'Seco' },
  { valor: 2, etiqueta: 'Camara Refrigerada', descripcion: 'Refrigerado' },
  { valor: 3, etiqueta: 'Deposito Central', descripcion: 'Seco' },
];

/** Selector controlado, como lo usan los formularios reales. */
function SelectorDePrueba({
  opciones = ALMACENES,
  inicial = null,
  onCambiar,
}: {
  opciones?: Opcion<number>[];
  inicial?: number | null;
  onCambiar?: (valor: number) => void;
}) {
  const [valor, setValor] = useState<number | null>(inicial);
  return (
    <Selector<number>
      etiqueta="Almacén"
      valor={valor}
      opciones={opciones}
      onCambiar={(v) => {
        setValor(v);
        onCambiar?.(v);
      }}
    />
  );
}

/**
 * Reproduce el contenedor que causaba el fallo: el cuerpo desplazable de un
 * diálogo. Un menú posicionado en flujo queda recortado aquí, y solo se ve la
 * primera opción.
 */
function DentroDeDialogo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxHeight: 200, overflowY: 'auto' }} data-testid="cuerpo-dialogo">
      {children}
    </div>
  );
}

describe('Selector', () => {
  it('muestra el marcador mientras no hay selección', () => {
    render(<SelectorDePrueba />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Seleccione…');
  });

  it('abre el menú y ofrece todas las opciones', async () => {
    const usuario = userEvent.setup();
    render(<SelectorDePrueba />);

    await usuario.click(screen.getByRole('combobox'));

    const lista = screen.getByRole('listbox');
    expect(within(lista).getAllByRole('option')).toHaveLength(3);
    expect(within(lista).getByText('Camara Refrigerada')).toBeInTheDocument();
  });

  it('selecciona una opción y la refleja en el disparador', async () => {
    const usuario = userEvent.setup();
    const alCambiar = vi.fn();
    render(<SelectorDePrueba onCambiar={alCambiar} />);

    await usuario.click(screen.getByRole('combobox'));
    await usuario.click(screen.getByText('Camara Refrigerada'));

    expect(alCambiar).toHaveBeenCalledWith(2);
    expect(screen.getByRole('combobox')).toHaveTextContent('Camara Refrigerada');
    // El menú se desmonta al terminar su animación de salida.
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('marca como seleccionada la opción vigente', async () => {
    const usuario = userEvent.setup();
    render(<SelectorDePrueba inicial={3} />);

    await usuario.click(screen.getByRole('combobox'));

    const opciones = screen.getAllByRole('option');
    expect(opciones[2]).toHaveAttribute('aria-selected', 'true');
    expect(opciones[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('no ofrece opciones deshabilitadas', async () => {
    const usuario = userEvent.setup();
    const alCambiar = vi.fn();
    render(
      <SelectorDePrueba
        opciones={[
          { valor: 1, etiqueta: 'Disponible' },
          { valor: 2, etiqueta: 'Agotado', deshabilitada: true },
        ]}
        onCambiar={alCambiar}
      />,
    );

    await usuario.click(screen.getByRole('combobox'));
    await usuario.click(screen.getByText('Agotado'));

    expect(alCambiar).not.toHaveBeenCalled();
  });

  it('informa cuando no hay opciones', async () => {
    const usuario = userEvent.setup();
    render(<SelectorDePrueba opciones={[]} />);

    await usuario.click(screen.getByRole('combobox'));

    expect(screen.getByText('No hay opciones disponibles')).toBeInTheDocument();
  });

  it('se cierra al pulsar fuera', async () => {
    const usuario = userEvent.setup();
    render(
      <div>
        <SelectorDePrueba />
        <button>Otro control</button>
      </div>,
    );

    await usuario.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await usuario.click(screen.getByText('Otro control'));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });
});

describe('Selector · navegación con teclado', () => {
  it('abre con la flecha abajo y elige con Enter', async () => {
    const usuario = userEvent.setup();
    const alCambiar = vi.fn();
    render(<SelectorDePrueba onCambiar={alCambiar} />);

    screen.getByRole('combobox').focus();
    await usuario.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await usuario.keyboard('{ArrowDown}{Enter}');
    expect(alCambiar).toHaveBeenCalledWith(2);
  });

  it('llega a la última opción con la tecla Fin', async () => {
    const usuario = userEvent.setup();
    const alCambiar = vi.fn();
    render(<SelectorDePrueba onCambiar={alCambiar} />);

    screen.getByRole('combobox').focus();
    await usuario.keyboard('{ArrowDown}{End}{Enter}');

    expect(alCambiar).toHaveBeenCalledWith(3);
  });

  it('cierra con Escape sin seleccionar', async () => {
    const usuario = userEvent.setup();
    const alCambiar = vi.fn();
    render(<SelectorDePrueba onCambiar={alCambiar} />);

    screen.getByRole('combobox').focus();
    await usuario.keyboard('{ArrowDown}{Escape}');

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(alCambiar).not.toHaveBeenCalled();
  });
});

describe('Selector · el menú escapa de contenedores con recorte', () => {
  /**
   * Es la regresión que motivó el arreglo. Dentro del cuerpo desplazable de un
   * diálogo, un menú posicionado en flujo quedaba recortado y solo mostraba la
   * primera opción, sin forma de llegar al resto.
   */
  it('se dibuja fuera del contenedor que lo recortaría', async () => {
    const usuario = userEvent.setup();
    render(
      <DentroDeDialogo>
        <SelectorDePrueba />
      </DentroDeDialogo>,
    );

    await usuario.click(screen.getByRole('combobox'));

    const lista = screen.getByRole('listbox');
    const cuerpo = screen.getByTestId('cuerpo-dialogo');

    expect(cuerpo).not.toContainElement(lista);
    expect(document.body).toContainElement(lista);
  });

  it('mantiene accesibles todas las opciones dentro del diálogo', async () => {
    const usuario = userEvent.setup();
    const alCambiar = vi.fn();
    render(
      <DentroDeDialogo>
        <SelectorDePrueba onCambiar={alCambiar} />
      </DentroDeDialogo>,
    );

    await usuario.click(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option')).toHaveLength(3);

    // La última opción era justamente la inalcanzable con el fallo.
    await usuario.click(screen.getByText('Deposito Central'));
    expect(alCambiar).toHaveBeenCalledWith(3);
  });

  it('se posiciona con coordenadas fijas respecto de la ventana', async () => {
    const usuario = userEvent.setup();
    render(
      <DentroDeDialogo>
        <SelectorDePrueba />
      </DentroDeDialogo>,
    );

    await usuario.click(screen.getByRole('combobox'));

    expect(screen.getByRole('listbox')).toHaveStyle({ position: 'fixed' });
  });
});
