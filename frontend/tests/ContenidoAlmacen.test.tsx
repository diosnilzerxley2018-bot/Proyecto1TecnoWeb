import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { contenidoDelAlmacen } from '@/lib/inventario';
import { PanelContenidoAlmacen } from '@/components/inventario/PanelContenidoAlmacen';
import type { Almacen, ExistenciaStock } from '@/types';

/**
 * CU-INV-02 — qué guarda cada almacén, visto desde su tarjeta.
 */

const SECO = 1;
const CAMARA = 2;

const existencias: ExistenciaStock[] = [
  {
    tipo: 'insumo',
    id: 10,
    nombre: 'Quinua real',
    unidad: 'kg',
    stockTotal: 22,
    stockGeneral: 22,
    stockMinimo: 5,
    bajoMinimo: false,
    existencias: [
      { idAlmacen: SECO, almacen: 'Almacen Seco', stock: 20 },
      { idAlmacen: CAMARA, almacen: 'Camara Refrigerada', stock: 2 },
    ],
  },
  {
    tipo: 'insumo',
    id: 11,
    nombre: 'Limón',
    unidad: 'kg',
    stockTotal: 1,
    stockGeneral: 1,
    stockMinimo: 3,
    bajoMinimo: true,
    existencias: [{ idAlmacen: CAMARA, almacen: 'Camara Refrigerada', stock: 1 }],
  },
  {
    tipo: 'producto',
    id: 20,
    nombre: 'Jugo verde detox',
    unidad: 'u',
    stockTotal: 0,
    stockGeneral: 0,
    stockMinimo: null,
    bajoMinimo: false,
    // Una fila en cero no es "estar guardado ahí".
    existencias: [{ idAlmacen: CAMARA, almacen: 'Camara Refrigerada', stock: 0 }],
  },
];

const camara: Almacen = {
  id: CAMARA,
  nombre: 'Camara Refrigerada',
  tipoConservacion: 'Refrigerado',
  ubicacionFisica: 'Planta baja - cocina',
  preferido: true,
};

describe('contenidoDelAlmacen', () => {
  it('reparte el stock por almacén y deja fuera lo que está en cero', () => {
    const enCamara = contenidoDelAlmacen(existencias, CAMARA);

    expect(enCamara.map((l) => [l.nombre, l.stock])).toEqual([
      ['Quinua real', 2],
      ['Limón', 1],
    ]);
    expect(contenidoDelAlmacen(existencias, SECO).map((l) => l.nombre)).toEqual(['Quinua real']);
  });
});

describe('PanelContenidoAlmacen', () => {
  const dibujar = () =>
    render(
      <PanelContenidoAlmacen
        almacen={camara}
        lineas={contenidoDelAlmacen(existencias, CAMARA)}
        onCerrar={vi.fn()}
      />,
    );

  it('muestra lo de este almacén y cuánto más hay en los otros', () => {
    dibujar();

    expect(screen.getByText('2 kg')).toBeInTheDocument();
    expect(screen.getByText('20 kg más en otros almacenes')).toBeInTheDocument();
    expect(screen.getByText('Reponer')).toBeInTheDocument();
  });

  it('busca sin tildes dentro del almacén', async () => {
    dibujar();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar en este almacén' }), 'limon');

    expect(screen.queryByText('Quinua real')).not.toBeInTheDocument();
    expect(screen.getByText('Limón').tagName).toBe('MARK');
  });

  it('un almacén sin existencias lo dice', () => {
    render(<PanelContenidoAlmacen almacen={camara} lineas={[]} onCerrar={vi.fn()} />);
    expect(screen.getByText('Este almacén está vacío')).toBeInTheDocument();
  });
});
