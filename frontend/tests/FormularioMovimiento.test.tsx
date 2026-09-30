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

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  ErrorApi: class ErrorApi extends Error {},
}));
vi.mock('@/components/ui/Notificaciones', () => ({
  useNotificaciones: () => ({ notificar }),
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

/** La compra F-101: 5 L de leche a Bs 15, de los que ya se devolvió 1. */
const COMPRA = {
  id: 12,
  fecha: '2026-09-29T14:00:00.000Z',
  proveedor: 'Distribuidora Sur',
  numeroDocumento: 'F-101',
  idCompra: null,
  observacion: null,
  lineas: [
    {
      tipo: 'insumo',
      id: 1,
      nombre: 'Leche',
      unidad: 'L',
      idAlmacen: 2,
      almacen: 'Camara Refrigerada',
      cantidad: 5,
      vinculado: 1,
      pendiente: 4,
      existencia: 5,
      costoUnitario: 15,
      controlaVencimiento: false,
      lote: null,
    },
  ],
};

/** La devolución EGR-0005 de esa compra: 2 L por reponer. */
const DEVOLUCION = {
  ...COMPRA,
  id: 5,
  idCompra: 12,
  observacion: 'Llegó vencida',
  lineas: [{ ...COMPRA.lineas[0], cantidad: 2, vinculado: 0, pendiente: 2, existencia: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  consultar.mockImplementation((ruta: string) => {
    if (ruta === '/ingresos/devolubles') return Promise.resolve([COMPRA] as never);
    if (ruta === '/egresos/reponibles') return Promise.resolve([DEVOLUCION] as never);
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

  it('no ofrece el motivo Producción: lo registra la orden al finalizarse', async () => {
    const usuario = await dibujar('ingreso');

    await usuario.click(screen.getByRole('combobox', { name: 'Motivo' }));

    const motivos = screen.getAllByRole('option').map((o) => o.textContent);
    expect(motivos).toEqual([
      expect.stringContaining('Compra'),
      expect.stringContaining('Reposición'),
      expect.stringContaining('Ajuste'),
      expect.stringContaining('Devolución'),
    ]);
    // La devolución de un ingreso es la del cliente.
    expect(motivos[3]).toContain('vuelven del cliente');
  });

  it('una reposición viene del proveedor: pide su nombre', async () => {
    const usuario = await dibujar('ingreso');

    await elegir(usuario, 'Motivo', /Reposición/);

    expect(screen.getByLabelText('Proveedor')).toBeInTheDocument();
  });

  it('una devolución ofrece solo productos, y señala el insumo elegido antes de cambiar de motivo', async () => {
    const usuario = await dibujar('ingreso');

    await elegir(usuario, 'Ítem', /Leche/);
    await elegir(usuario, 'Motivo', /Devolución/);
    await usuario.type(screen.getByLabelText('Cantidad'), '1');
    await usuario.click(screen.getByRole('button', { name: 'Registrar ingreso' }));

    expect(
      await screen.findByText('Una devolución es de productos terminados: cambie o quite este insumo'),
    ).toBeInTheDocument();
    expect(registrar).not.toHaveBeenCalled();

    // Entre los ítems no está la avena; la leche sigue a la vista, apagada.
    await usuario.click(screen.getByRole('combobox', { name: 'Ítem' }));
    expect(screen.queryByRole('option', { name: /Avena/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Barra de avena/ })).toBeInTheDocument();
    const leche = screen.getByRole('option', { name: /Leche/ });
    expect(leche).toHaveTextContent('una devolución es de productos terminados');
    expect(within(leche).getByRole('button')).toBeDisabled();
  });
});

describe('Nota de egreso', () => {
  it('ofrece Merma, Ajuste y Devolución, sin Producción: esa la descuenta la orden', async () => {
    const usuario = await dibujar('egreso');

    await usuario.click(screen.getByRole('combobox', { name: 'Motivo' }));

    const motivos = screen.getAllByRole('option').map((o) => o.textContent);
    expect(motivos).toEqual([
      expect.stringContaining('Merma'),
      expect.stringContaining('Ajuste'),
      expect.stringContaining('Devolución'),
    ]);
    // La devolución de un egreso es la que se le hace al proveedor.
    expect(motivos[2]).toContain('se le devuelve al proveedor');
  });

  it('una devolución al proveedor se elige de una compra, y devuelve hasta lo que falta', async () => {
    const usuario = await dibujar('egreso');

    await elegir(usuario, 'Motivo', /Devolución/);
    // No se eligen ítems sueltos: se elige la compra, buscándola.
    expect(screen.queryByRole('combobox', { name: 'Ítem' })).not.toBeInTheDocument();
    await elegir(usuario, 'Compra que se devuelve', /ING-0012 · Distribuidora Sur/);

    expect(screen.getByText(/entraron 5 L a Bs 15,00, ya se devolvieron 1/)).toBeInTheDocument();
    const cantidad = screen.getByLabelText('Cantidad a devolver');
    await usuario.type(cantidad, '5');
    await usuario.click(screen.getByRole('button', { name: 'Registrar egreso' }));
    expect(await screen.findByText('Hasta 4 L')).toBeInTheDocument();
    expect(registrar).not.toHaveBeenCalled();

    await usuario.clear(cantidad);
    await usuario.type(cantidad, '2');
    await usuario.type(screen.getByLabelText('Observación'), 'Llegó vencida');
    await usuario.click(screen.getByRole('button', { name: 'Registrar egreso' }));

    expect(registrar).toHaveBeenCalledWith('/egresos', {
      motivo: 'Devolucion',
      observacion: 'Llegó vencida',
      idNotaIngreso: 12,
      insumos: [{ idIngrediente: 1, idAlmacen: 2, cantidad: 2 }],
      productos: [],
    });
  });

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

describe('Reposición', () => {
  it('se elige la devolución y ya propone lo que falta reponer, al precio de la compra', async () => {
    registrar.mockResolvedValue({} as never);
    const usuario = await dibujar('ingreso');

    await elegir(usuario, 'Motivo', /Reposición/);
    await elegir(usuario, 'Devolución que se repone', /EGR-0005/);

    expect(screen.getByLabelText('Cantidad a reponer')).toHaveValue(2);
    expect(screen.getByText(/Vuelve al precio de la compra: Bs 15,00/)).toBeInTheDocument();
    // El proveedor es el de la compra.
    expect(screen.getByLabelText('Proveedor')).toHaveValue('Distribuidora Sur');

    await usuario.click(screen.getByRole('button', { name: 'Registrar ingreso' }));

    expect(registrar).toHaveBeenCalledWith('/ingresos', {
      motivo: 'Reposicion',
      proveedor: 'Distribuidora Sur',
      numeroDocumento: null,
      idNotaEgreso: 5,
      insumos: [{ idIngrediente: 1, idAlmacen: 2, cantidad: 2, costoUnitario: 15 }],
      productos: [],
    });
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
