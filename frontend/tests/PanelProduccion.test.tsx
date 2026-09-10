import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PanelProduccion } from '@/components/ventas/PanelProduccion';
import type { EvaluacionVenta, LineaEvaluacion } from '@/types';

/** Línea de evaluación con lo mínimo, para variarla en cada caso. */
function linea(cambios: Partial<LineaEvaluacion> = {}): LineaEvaluacion {
  return {
    idProducto: 1,
    nombre: 'Jugo de gualele',
    solicitado: 5,
    enStock: 2,
    faltante: 3,
    requiereProduccion: true,
    producible: true,
    cantidadAProducir: 3,
    excedente: 0,
    insumos: [
      {
        idIngrediente: 7,
        nombre: 'Leche entera',
        unidad: 'L',
        cantidadRequerida: 3,
        costoUnitario: 8,
      },
    ],
    costoProduccion: 24,
    almacenesCompatibles: [{ id: 1, nombre: 'Almacen Seco' }],
    requiereElegirAlmacen: false,
    insumosFaltantes: [],
    ...cambios,
  };
}

const evaluacion = (
  lineas: LineaEvaluacion[],
  insumosFaltantes: EvaluacionVenta['insumosFaltantes'] = [],
): EvaluacionVenta => ({
  lineas,
  requiereProduccion: lineas.some((l) => l.requiereProduccion),
  puedeVenderse:
    lineas.every((l) => !l.requiereProduccion || l.producible) && insumosFaltantes.length === 0,
  insumosFaltantes,
});

describe('PanelProduccion', () => {
  it('no aparece cuando el stock alcanza', () => {
    const sinFaltante = linea({ faltante: 0, requiereProduccion: false, cantidadAProducir: 0 });
    const { container } = render(
      <PanelProduccion
        evaluacion={evaluacion([sinFaltante])}
        cargando={false}
        destinos={{}}
        onElegirDestino={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('anuncia solo el faltante, no lo pedido', () => {
    render(
      <PanelProduccion
        evaluacion={evaluacion([linea()])}
        cargando={false}
        destinos={{}}
        onElegirDestino={vi.fn()}
      />,
    );

    expect(screen.getByText('Se preparará al instante')).toBeInTheDocument();
    // Piden 5 y hay 2: se elaboran 3, que es lo que debe verse.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/2 en existencias · faltan 3/)).toBeInTheDocument();
    expect(screen.getByText('Leche entera')).toBeInTheDocument();
    expect(screen.getByText('3 L')).toBeInTheDocument();
  });

  it('avisa del excedente cuando la receta no es divisible', () => {
    render(
      <PanelProduccion
        evaluacion={evaluacion([
          linea({ faltante: 3, cantidadAProducir: 4, excedente: 1, nombre: 'Galletas de avena' }),
        ])}
        cargando={false}
        destinos={{}}
        onElegirDestino={vi.fn()}
      />,
    );

    expect(screen.getByText(/1 queda en inventario/)).toBeInTheDocument();
  });

  it('explica por qué un producto no puede prepararse', () => {
    render(
      <PanelProduccion
        evaluacion={evaluacion([
          linea({
            producible: false,
            motivo: 'El producto no tiene receta activa: solo puede venderse de existencias',
            cantidadAProducir: 0,
            insumos: [],
          }),
        ])}
        cargando={false}
        destinos={{}}
        onElegirDestino={vi.fn()}
      />,
    );

    expect(screen.getByText(/no tiene receta activa/)).toBeInTheDocument();
    expect(screen.getByText(/Reduzca la cantidad/)).toBeInTheDocument();
    // Sin poder producir, el costo de la corrida no significa nada.
    expect(screen.queryByText('Costo de los insumos')).not.toBeInTheDocument();
  });

  it('pide el almacén de destino cuando hay más de uno compatible', async () => {
    const elegir = vi.fn();
    render(
      <PanelProduccion
        evaluacion={evaluacion([
          linea({
            requiereElegirAlmacen: true,
            almacenesCompatibles: [
              { id: 1, nombre: 'Almacen Seco' },
              { id: 3, nombre: 'Deposito Central' },
            ],
          }),
        ])}
        cargando={false}
        destinos={{}}
        onElegirDestino={elegir}
      />,
    );

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole('combobox', { name: /almacén de destino/i }));
    await usuario.click(screen.getByText('Deposito Central'));

    expect(elegir).toHaveBeenCalledWith(1, 3);
  });

  it('mientras evalúa no adelanta un resultado que aún no tiene', () => {
    render(
      <PanelProduccion
        evaluacion={null}
        cargando
        destinos={{}}
        onElegirDestino={vi.fn()}
      />,
    );

    expect(screen.getByText('Comprobando existencias…')).toBeInTheDocument();
    expect(screen.queryByText('Se preparará al instante')).not.toBeInTheDocument();
  });

  it('detalla qué insumo falta y cuánto, no solo que falta', () => {
    render(
      <PanelProduccion
        evaluacion={evaluacion([
          linea({
            producible: false,
            motivo: 'Insumos insuficientes',
            insumosFaltantes: [
              { nombre: 'Leche entera', unidad: 'L', requerido: 10, disponible: 3 },
            ],
          }),
        ])}
        cargando={false}
        destinos={{}}
        onElegirDestino={vi.fn()}
      />,
    );

    expect(screen.getByText(/hay 3 L, hacen falta 10/)).toBeInTheDocument();
  });

  /** Dos productos producibles por separado pero no juntos. */
  it('avisa cuando el insumo no alcanza para el ticket completo', () => {
    render(
      <PanelProduccion
        evaluacion={evaluacion(
          [linea(), linea({ idProducto: 2, nombre: 'Jugo de tumbo' })],
          [{ nombre: 'Leche entera', unidad: 'L', requerido: 8, disponible: 6 }],
        )}
        cargando={false}
        destinos={{}}
        onElegirDestino={vi.fn()}
      />,
    );

    expect(screen.getByText(/comparten el mismo insumo/)).toBeInTheDocument();
    expect(screen.getByText(/hay 6 L, hacen falta 8/)).toBeInTheDocument();
    // Con el ticket bloqueado, el costo de la corrida no significa nada.
    expect(screen.queryByText('Costo de los insumos')).not.toBeInTheDocument();
  });
});
