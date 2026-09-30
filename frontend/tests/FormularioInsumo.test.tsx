import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormularioInsumo } from '@/components/inventario/FormularioInsumo';
import type { Insumo } from '@/types';

/**
 * Alta y edición de insumos (CU-INV-01): el costo no se escribe aquí, lo fija
 * su primera compra; y se mide en kilogramos, litros o unidades.
 */

const notificar = vi.fn();

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  ErrorApi: class ErrorApi extends Error {},
}));
vi.mock('@/components/ui/Notificaciones', () => ({
  useNotificaciones: () => ({ notificar }),
}));

const { api } = await import('@/lib/api');

const UNIDADES = [
  { id: 1, nombre: 'Kilogramo', abreviatura: 'kg' },
  { id: 3, nombre: 'Litro', abreviatura: 'L' },
  { id: 5, nombre: 'Unidad', abreviatura: 'u' },
];

const SAL: Insumo = {
  id: 9,
  nombre: 'Sal',
  unidad: { id: 1, nombre: 'Kilogramo', abreviatura: 'kg' },
  costoUnitario: 10,
  stockMinimo: 2,
  activo: true,
  tipoConservacion: 'Seco',
  controlaVencimiento: false,
  stockTotal: 5,
  existencias: [],
} as unknown as Insumo;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue(UNIDADES as never);
  vi.mocked(api.post).mockResolvedValue({} as never);
});

describe('FormularioInsumo', () => {
  it('no pide costo: lo fija la primera compra', async () => {
    const usuario = userEvent.setup();
    render(<FormularioInsumo onListo={vi.fn()} onCancelar={vi.fn()} />);

    expect(screen.queryByLabelText(/Costo unitario/)).not.toBeInTheDocument();
    expect(await screen.findByText(/lo fija la primera nota de ingreso por Compra/)).toBeInTheDocument();

    await usuario.type(screen.getByLabelText('Nombre del insumo'), 'Sal');
    await usuario.type(screen.getByLabelText('Stock mínimo'), '2');
    await usuario.click(screen.getByRole('button', { name: 'Registrar insumo' }));

    const cuerpo = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>;
    expect(cuerpo).not.toHaveProperty('costoUnitario');
    expect(cuerpo).toMatchObject({ nombre: 'Sal', idUnidad: 1, stockMinimo: 2 });
  });

  it('ofrece kilogramo, litro y unidad', async () => {
    const usuario = userEvent.setup();
    render(<FormularioInsumo onListo={vi.fn()} onCancelar={vi.fn()} />);

    await usuario.click(await screen.findByRole('combobox', { name: 'Unidad de medida' }));

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Kilogramo'),
      expect.stringContaining('Litro'),
      expect.stringContaining('Unidad'),
    ]);
  });

  it('al editar muestra el costo actual como dato, por su unidad', async () => {
    render(<FormularioInsumo insumo={SAL} onListo={vi.fn()} onCancelar={vi.fn()} />);

    expect(await screen.findByText('Bs 10,00 por kg')).toBeInTheDocument();
  });

  it('un insumo anterior en gramos sigue mostrando su unidad', async () => {
    const enGramos = { ...SAL, unidad: { id: 2, nombre: 'Gramo', abreviatura: 'g' } } as Insumo;
    render(<FormularioInsumo insumo={enGramos} onListo={vi.fn()} onCancelar={vi.fn()} />);

    expect(await screen.findByRole('combobox', { name: 'Unidad de medida' })).toHaveTextContent('Gramo');
  });
});
