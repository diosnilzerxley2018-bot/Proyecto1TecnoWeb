import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CifrasGanancia, columnasGanancia } from '@/components/reportes/Ganancia';
import { TablaReporte } from '@/components/reportes/PiezasReporte';
import type { LineaProductoReporte } from '@/types';

/**
 * La ganancia en los reportes de ventas y de pedidos (RF-VEN-07, RF-PED-10):
 * el agua comprada a Bs 4 y vendida a Bs 7, tres unidades.
 */

const agua = {
  costo: 12,
  ganancia: 9,
  margen: 42.86,
  unidadesSinCosto: 0,
};

describe('CifrasGanancia', () => {
  it('muestra el costo de lo vendido, la ganancia y el margen', () => {
    render(<CifrasGanancia ganancia={agua} />);

    expect(screen.getByText('Bs 12,00')).toBeInTheDocument();
    expect(screen.getByText('Bs 9,00')).toBeInTheDocument();
    expect(screen.getByText('42,9 %')).toBeInTheDocument();
    expect(screen.getByText('De cada Bs 100 cobrados quedan Bs 42,86')).toBeInTheDocument();
  });

  it('una pérdida se ve como pérdida', () => {
    render(<CifrasGanancia ganancia={{ costo: 25, ganancia: -4, margen: -19.05, unidadesSinCosto: 0 }} />);

    expect(screen.getByText('-Bs 4,00')).toHaveClass('text-peligro');
  });

  it('sin costo no inventa una ganancia, y dice cuántas unidades quedaron fuera', () => {
    render(
      <CifrasGanancia ganancia={{ costo: null, ganancia: null, margen: null, unidadesSinCosto: 2 }} />,
    );

    expect(screen.getAllByText('Sin costo')).toHaveLength(3);
    expect(screen.getByText(/2 unidades se vendieron sin costo registrado/)).toBeInTheDocument();
  });
});

describe('columnasGanancia', () => {
  it('agrega costo, ganancia y margen a la tabla por producto', () => {
    const fila: LineaProductoReporte = {
      idProducto: 1,
      nombre: 'Agua natural',
      unidades: 3,
      importe: 21,
      participacion: 100,
      ...agua,
    };
    render(
      <TablaReporte<LineaProductoReporte>
        titulo="Por producto"
        filas={[fila]}
        clave={(f) => f.idProducto}
        columnas={[{ titulo: 'Producto', celda: (f) => f.nombre }, ...columnasGanancia<LineaProductoReporte>()]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Ganancia' })).toBeInTheDocument();
    expect(screen.getByText('Bs 9,00')).toHaveClass('text-marca-300');
    expect(screen.getByText('42,9 %')).toBeInTheDocument();
  });
});
