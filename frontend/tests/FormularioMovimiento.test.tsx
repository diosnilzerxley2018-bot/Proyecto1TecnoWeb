import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormularioMovimiento, type Direccion } from '@/components/inventario/FormularioMovimiento';
import { lineaVacia, revisarLineas, type ItemMovible } from '@/components/inventario/EditorLineas';
import type { Almacen } from '@/types';

/**
 * Notas de ingreso y egreso (CU-INV-03 y CU-INV-04): que el formulario
 * proponga lo que se puede proponer, diga lo que hay y no pierda una línea
 * a medio llenar.
 */

const notificar = vi.fn();
const permisos = new Set(['INGRESO_REGISTRAR', 'EGRESO_REGISTRAR', 'ORDEN_PRODUCCION_GESTIONAR']);

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  ErrorApi: class ErrorApi extends Error {},
}));
vi.mock('@/components/ui/Notificaciones', () => ({
  useNotificaciones: () => ({ notificar }),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ tienePermiso: (p: string) => permisos.has(p) }),
}));

const { api } = await import('@/lib/api');
const consultar = vi.mocked(api.get);
const registrar = vi.mocked(api.post);

const ALMACENES = [
  { id: 1, nombre: 'Almacen Seco', tipoConservacion: 'Seco', ubicacionFisica: null, preferido: true },
  { id: 2, nombre: 'Camara Refrigerada', tipoConservacion: 'Refrigerado', ubicacionFisica: null, preferido: true },
  { id: 3, nombre: 'Deposito Central', tipoConservacion: 'Seco', ubicacionFisica: null, preferido: false },
] as Almacen[];

const INSUMOS = [
  {
    id: 1,
    nombre: 'Leche',
    unidad: { id: 3, nombre: 'Litro', abreviatura: 'L' },
    costoUnitario: 8,
    stockMinimo: 2,
    activo: true,
    tipoConservacion: 'Refrigerado',
    controlaVencimiento: false,
    stockTotal: 5,
    existencias: [{ idAlmacen: 2, almacen: 'Camara Refrigerada', stock: 5 }],
  },
  {
    id: 2,
    nombre: 'Avena',
    unidad: { id: 1, nombre: 'Kilogramo', abreviatura: 'kg' },
    costoUnitario: 14,
    stockMinimo: 1,
    activo: true,
    tipoConservacion: 'Seco',
    controlaVencimiento: false,
    stockTotal: 3,
    existencias: [
      { idAlmacen: 1, almacen: 'Almacen Seco', stock: 2 },
      { idAlmacen: 3, almacen: 'Deposito Central', stock: 1 },
    ],
  },
];

const BARRA = {
  id: 7,
  nombre: 'Barra de avena',
  descripcion: null,
  precio: 12,
  activo: true,
  tipoConservacion: 'Seco',
  categoria: { id: 1, nombre: 'Snacks' },
  valorNutricional: null,
  stockTotal: 4,
  existencias: [{ idAlmacen: 1, almacen: 'Almacen Seco', stock: 4 }],
  costoPromedio: null,
  vendeBajoCosto: false,
  imagenActualizadaEn: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  consultar.mockImplementation((ruta: string) => {
    if (ruta.startsWith('/insumos')) return Promise.resolve(INSUMOS as never);
    if (ruta === '/productos/7') return Promise.resolve({ ...BARRA, costoPromedio: 5.5 } as never);
    if (ruta.startsWith('/productos')) return Promise.resolve([BARRA] as never);
    if (ruta === '/almacenes') return Promise.resolve(ALMACENES as never);
    return Promise.reject(new Error(`ruta inesperada: ${ruta}`));
  });
  registrar.mockResolvedValue({ alertas: [] } as never);
});

async function dibujar(direccion: Direccion) {
  render(<FormularioMovimiento direccion={direccion} onListo={vi.fn()} onCancelar={vi.fn()} />);
  await screen.findByRole('combobox', { name: 'Ítem' });
  return userEvent.setup();
}

async function elegir(usuario: ReturnType<typeof userEvent.setup>, campo: string, opcion: RegExp) {
  await usuario.click(screen.getByRole('combobox', { name: campo }));
  await usuario.click(within(screen.getByRole('option', { name: opcion })).getByRole('button'));
}

describe('Nota de ingreso', () => {
  it('propone el único almacén de la conservación del insumo, y su costo por litro', async () => {
    const usuario = await dibujar('ingreso');

    await elegir(usuario, 'Ítem', /Leche/);

    expect(screen.getByRole('combobox', { name: 'Almacén' })).toHaveTextContent('Camara Refrigerada');
    expect(screen.getByLabelText('Precio pagado por litro')).toHaveValue(8);
    // Un almacén seco no se puede elegir para la leche, y dice por qué.
    await usuario.click(screen.getByRole('combobox', { name: 'Almacén' }));
    const seco = screen.getByRole('option', { name: /Almacen Seco/ });
    expect(seco).toHaveTextContent('no apto, el ítem va en refrigerado');
    expect(within(seco).getByRole('button')).toBeDisabled();
  });

  it('un producto no toma su precio de venta como costo: toma el promedio de su ficha', async () => {
    const usuario = await dibujar('ingreso');

    await elegir(usuario, 'Ítem', /Barra de avena/);

    const costo = screen.getByLabelText('Precio pagado por unidad');
    expect(costo).not.toHaveValue(12);
    await waitFor(() => expect(costo).toHaveValue(5.5));
    expect(consultar).toHaveBeenCalledWith('/productos/7');
    // Dos almacenes secos: propone el preferido.
    expect(screen.getByRole('combobox', { name: 'Almacén' })).toHaveTextContent('Almacen Seco');
  });

  it('fuera de una compra, el costo no se presenta como precio pagado', async () => {
    const usuario = await dibujar('ingreso');

    await elegir(usuario, 'Motivo', /Ajuste/);
    await elegir(usuario, 'Ítem', /Leche/);

    expect(screen.getByLabelText('Costo por litro')).toBeInTheDocument();
    expect(screen.getByText(/el costo del insumo cambia únicamente con una compra/)).toBeInTheDocument();
    // El proveedor es de una compra.
    expect(screen.queryByLabelText('Proveedor')).not.toBeInTheDocument();
  });

  it('con dos almacenes aptos, propone el que ya guarda ese insumo', async () => {
    const otraCamara = { ...ALMACENES[1], id: 4, nombre: 'Camara Nueva', preferido: false };
    const almacenes = [otraCamara, ...ALMACENES];
    consultar.mockImplementation((ruta: string) => {
      if (ruta.startsWith('/insumos')) return Promise.resolve(INSUMOS as never);
      if (ruta.startsWith('/productos')) return Promise.resolve([BARRA] as never);
      if (ruta === '/almacenes') return Promise.resolve(almacenes as never);
      return Promise.reject(new Error(`ruta inesperada: ${ruta}`));
    });
    const usuario = await dibujar('ingreso');

    await elegir(usuario, 'Ítem', /Leche/);

    // La leche ya está en Camara Refrigerada, no en la nueva.
    expect(screen.getByRole('combobox', { name: 'Almacén' })).toHaveTextContent('Camara Refrigerada');
  });

  it('una línea a medio llenar se señala en lugar de perderse', async () => {
    const usuario = await dibujar('ingreso');

    await elegir(usuario, 'Ítem', /Leche/);
    await usuario.click(screen.getByRole('button', { name: 'Registrar ingreso' }));

    expect(screen.getByText('Indique la cantidad')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Revise la línea marcada arriba');
    expect(registrar).not.toHaveBeenCalled();
  });

  it('con el motivo Producción avisa que la orden ya movió el stock y lleva a las órdenes', async () => {
    const usuario = await dibujar('ingreso');

    await elegir(usuario, 'Motivo', /Producción/);

    expect(screen.getByText(/se contará dos veces/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Órdenes de producción/ })).toHaveAttribute(
      'href',
      '/produccion/ordenes',
    );
  });
});

describe('Nota de egreso', () => {
  it('cada almacén dice cuánto hay, y no deja sacar más de eso', async () => {
    const usuario = await dibujar('egreso');

    await elegir(usuario, 'Ítem', /Avena/);
    // Hay en dos almacenes: no se adivina de cuál sale.
    expect(screen.getByRole('combobox', { name: 'Almacén' })).not.toHaveTextContent('Deposito');

    await usuario.click(screen.getByRole('combobox', { name: 'Almacén' }));
    expect(screen.getByRole('option', { name: /Almacen Seco/ })).toHaveTextContent('Hay 2 kg');
    expect(
      within(screen.getByRole('option', { name: /Camara Refrigerada/ })).getByRole('button'),
    ).toBeDisabled();
    await usuario.click(
      within(screen.getByRole('option', { name: /Deposito Central/ })).getByRole('button'),
    );

    await usuario.type(screen.getByLabelText('Cantidad'), '1.5');
    expect(screen.getByText('Hay 1 kg en este almacén')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Registrar egreso' }));

    // El error reemplaza a la ayuda cuando esta termina de salir.
    expect(await screen.findByText('Solo hay 1 kg en Deposito Central')).toBeInTheDocument();
    expect(registrar).not.toHaveBeenCalled();
  });
});

describe('revisarLineas', () => {
  const avena: ItemMovible = {
    clave: 'insumo:2',
    tipo: 'insumo',
    id: 2,
    nombre: 'Avena',
    unidad: 'kg',
    nombreUnidad: 'kilogramo',
    costoSugerido: 14,
    costoPendiente: false,
    controlaVencimiento: false,
    tipoConservacion: 'Seco',
    existencias: [{ idAlmacen: 1, stock: 2 }],
  };
  const linea = (cantidad: string) => ({ ...lineaVacia(1), clave: avena.clave, cantidad });

  it('ignora la línea en blanco que quedó de más', () => {
    expect(revisarLineas([linea('1'), lineaVacia(1)], [avena], ALMACENES, false).size).toBe(0);
  });

  it('suma las líneas del mismo insumo y almacén, como el servidor', () => {
    const [primera, segunda] = [linea('1.5'), linea('1')];
    const problemas = revisarLineas([primera, segunda], [avena], ALMACENES, false);

    expect(problemas.has(primera.uid)).toBe(false);
    expect(problemas.get(segunda.uid)?.mensaje).toBe(
      'Solo hay 2 kg en Almacen Seco y otra línea ya saca 1,5',
    );
  });
});
