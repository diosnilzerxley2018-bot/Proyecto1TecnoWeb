import {
  Boxes,
  ChefHat,
  ClipboardList,
  Factory,
  Receipt,
  UserRound,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { palabrasDe } from './texto';
import { ETIQUETA_ESTADO, TONO_ESTADO } from './pedidos';
import { TONO_ORDEN } from './ordenes';
import type { Tono } from '@/components/ui/Insignia';
import type { EstadoOrden, EstadoPedido, ResultadoGeneral, TipoResultado } from '@/types';

/**
 * Cómo se presenta cada tipo de resultado del buscador general y a dónde lleva.
 *
 * Las rutas viven aquí y no en el servidor porque son de la interfaz. Cada
 * destino abre la pantalla ya enfocada en lo elegido —el panel del pedido, el
 * comprobante de la venta, el listado filtrado—: es lo que cada pantalla
 * atiende con `useEnlaceDirecto`.
 */
export const TIPOS_RESULTADO: Record<
  TipoResultado,
  { grupo: string; icono: LucideIcon; ruta: (r: ResultadoGeneral) => string }
> = {
  pedido: {
    grupo: 'Pedidos',
    icono: ClipboardList,
    ruta: (r) => `/pedidos/lista?pedido=${r.id}`,
  },
  venta: {
    grupo: 'Ventas',
    icono: Receipt,
    ruta: (r) => `/ventas/historial?venta=${r.id}`,
  },
  orden: {
    grupo: 'Órdenes de producción',
    icono: Factory,
    ruta: (r) => `/produccion/ordenes?orden=${r.id}`,
  },
  cliente: {
    grupo: 'Clientes',
    icono: UserRound,
    ruta: (r) => `/ventas/clientes?buscar=${encodeURIComponent(r.referencia ?? r.titulo)}`,
  },
  producto: {
    grupo: 'Productos',
    icono: ChefHat,
    ruta: (r) => `/produccion/productos?producto=${r.id}`,
  },
  insumo: {
    grupo: 'Insumos',
    icono: Boxes,
    ruta: (r) => `/inventario/stock?buscar=${encodeURIComponent(r.referencia ?? r.titulo)}`,
  },
  almacen: {
    grupo: 'Almacenes',
    icono: Warehouse,
    ruta: (r) => `/inventario/almacenes?almacen=${r.id}`,
  },
  usuario: {
    grupo: 'Usuarios',
    icono: Users,
    ruta: (r) => `/usuarios?buscar=${encodeURIComponent(r.referencia ?? r.titulo)}`,
  },
};

/** El orden de los grupos: primero lo que se atiende en el día. */
export const ORDEN_TIPOS: TipoResultado[] = [
  'pedido',
  'venta',
  'orden',
  'cliente',
  'producto',
  'insumo',
  'almacen',
  'usuario',
];

/** «12» o «#12»: un número busca pedidos, ventas y órdenes por su identificador. */
export const esNumero = (texto: string) => /^#?\d{1,9}$/.test(texto.trim());

/**
 * Si vale la pena preguntarle al servidor.
 *
 * Es la misma regla que aplica él: un número basta aunque sea de un dígito; un
 * texto necesita al menos dos letras, porque una sola coincide con casi todo.
 */
export function valeLaPenaBuscar(texto: string): boolean {
  return esNumero(texto) || palabrasDe(texto).join('').length >= 2;
}

const TONO_PAGO_VENTA: Record<string, Tono> = {
  Pagado: 'marca',
  Pendiente: 'aviso',
  Anulado: 'peligro',
};

/** El estado de un resultado, con el mismo nombre y color que en su pantalla. */
export function estadoVisible(r: ResultadoGeneral): { etiqueta: string; tono: Tono } | null {
  if (!r.estado) return null;
  switch (r.tipo) {
    case 'pedido':
      return {
        etiqueta: ETIQUETA_ESTADO[r.estado as EstadoPedido] ?? r.estado,
        tono: TONO_ESTADO[r.estado as EstadoPedido] ?? 'neutro',
      };
    case 'orden':
      return { etiqueta: r.estado, tono: TONO_ORDEN[r.estado as EstadoOrden] ?? 'neutro' };
    case 'venta':
      return { etiqueta: r.estado, tono: TONO_PAGO_VENTA[r.estado] ?? 'neutro' };
    default:
      return null;
  }
}
