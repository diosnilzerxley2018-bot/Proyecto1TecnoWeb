import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { textoDePago } from '@/lib/pedidos';
import { ListaPermisos } from '@/components/ListaPermisos';
import { Pendientes } from '@/components/inicio/Pendientes';

/**
 * Que cada pantalla diga lo que pasa en palabras de quien la usa: el cobro
 * de un pedido ya entregado, los permisos de un rol y lo que le espera hoy a
 * cada cargo.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
  ErrorApi: class ErrorApi extends Error {},
}));

let cargo: string | null = 'Cocinero';
const permisos = new Set([
  'PEDIDO_LEER',
  'ORDEN_PRODUCCION_GESTIONAR',
  'STOCK_CONSULTAR',
  'VENTA_LEER',
]);
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    sesion: { usuario: { id: 3, cargo } },
    tienePermiso: (p: string) => permisos.has(p),
  }),
}));

const { api } = await import('@/lib/api');
const consultar = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
  cargo = 'Cocinero';
  consultar.mockImplementation((ruta: string) => {
    if (ruta === '/gestion/pedidos/resumen')
      return Promise.resolve({ Recibido: 3, 'En preparacion': 1, 'En camino': 2 } as never);
    if (ruta === '/ordenes/resumen') return Promise.resolve({ Pendiente: 2, 'En proceso': 0 } as never);
    if (ruta === '/stock/alertas')
      return Promise.resolve([{ nombre: 'Leche' }, { nombre: 'Tomate' }, { nombre: 'Limón' }] as never);
    if (ruta.startsWith('/stock/vencimientos')) return Promise.resolve([] as never);
    if (ruta.startsWith('/reportes/ventas'))
      return Promise.resolve({ resumen: { cantidadVentas: 4, total: 120 } } as never);
    return Promise.reject(new Error(`ruta inesperada: ${ruta}`));
  });
});

describe('textoDePago', () => {
  const pedido = { metodoPago: 'Efectivo' as const, estadoPago: 'Pendiente', total: 35 };

  it('un pedido entregado sin cobro anotado no pide cobrarlo otra vez', () => {
    const r = textoDePago({ ...pedido, estadoPedido: 'Entregado' }, 'personal');
    expect(r.texto).toBe('Entregado · cobro no registrado en el sistema');
    expect(r.texto).not.toMatch(/Cobrar/);
  });

  it('antes de entregarlo, sí dice cuánto cobrar', () => {
    const r = textoDePago({ ...pedido, estadoPedido: 'En camino' }, 'personal');
    // El espacio entre «Bs» y el número es duro: no se parten en dos líneas.
    expect(r.texto.replace(/\s/g, ' ')).toBe('Cobrar Bs 35,00 en efectivo');
  });
});

describe('ListaPermisos', () => {
  it('dice qué permite cada permiso y los agrupa por parte del sistema', () => {
    render(
      <ListaPermisos
        opciones={[
          { clave: 1, codigo: 'PEDIDO_CERRAR_AJENO', marcado: true },
          { clave: 2, codigo: 'USUARIO_LEER', marcado: false },
        ]}
        onAlternar={vi.fn()}
      />,
    );

    expect(screen.getByText('Cerrar entregas de otro repartidor')).toBeInTheDocument();
    expect(screen.getByText('PEDIDO_CERRAR_AJENO')).toBeInTheDocument();
    const grupos = screen.getAllByRole('group').map((g) => g.querySelector('legend')?.textContent);
    // Seguridad antes que Pedidos: el orden de los grupos es fijo.
    expect(grupos).toEqual(['Usuarios y seguridad', 'Pedidos']);
  });
});

describe('Pendientes del inicio', () => {
  it('al cocinero le muestra los pedidos por preparar, sus órdenes y lo que falta, no las ventas', async () => {
    render(<Pendientes />);

    expect(await screen.findByText('Pedidos por preparar')).toBeInTheDocument();
    expect(screen.getByText('1 en cocina · 2 en camino')).toBeInTheDocument();
    expect(screen.getByText('Órdenes de producción')).toBeInTheDocument();
    expect(screen.getByText('Leche, Tomate y 1 más')).toBeInTheDocument();
    expect(screen.queryByText('Vendido hoy en el local')).not.toBeInTheDocument();
    // Cada tarjeta lleva a donde se atiende.
    expect(screen.getByRole('link', { name: /Pedidos por preparar/ })).toHaveAttribute(
      'href',
      '/pedidos/lista?estado=Recibido',
    );
  });

  it('a la vendedora le muestra lo vendido hoy', async () => {
    cargo = 'Vendedor';
    render(<Pendientes />);

    expect(await screen.findByText('Vendido hoy en el local')).toBeInTheDocument();
    expect(screen.getByText('4 ventas')).toBeInTheDocument();
    expect(screen.queryByText('Órdenes de producción')).not.toBeInTheDocument();
  });
});
