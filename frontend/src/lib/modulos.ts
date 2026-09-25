import { CARGO_REPARTIDOR } from './dominio';
import {
  Bike,
  Boxes,
  ChefHat,
  ClipboardList,
  ShieldCheck,
  ShoppingBag,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Catálogo único de módulos del sistema.
 *
 * Lo consumen la barra lateral y la pantalla principal, para que ambas
 * muestren siempre lo mismo sin duplicar la definición.
 */
export interface Modulo {
  /** Nombre corto, para la barra lateral. */
  etiqueta: string;
  /** Nombre extendido, para las tarjetas de la pantalla principal. */
  titulo: string;
  descripcion: string;
  ruta: string;
  icono: LucideIcon;
  /** Permiso mínimo para acceder. `null` significa que no requiere ninguno. */
  permiso: string | null;
  /**
   * Cargos para los que es una pantalla de trabajo. Sin la lista, la ven
   * todos los que tienen el permiso.
   *
   * No es seguridad —la da el permiso, que verifica el servidor—: es enfoque.
   * "Mis entregas" pide `PEDIDO_LEER`, que tiene todo empleado, y el cocinero
   * terminaba con una pantalla de reparto en su menú.
   */
  cargos?: string[];
  /** Indica si el módulo ya está construido. */
  implementado: boolean;
}

export const MODULOS: Modulo[] = [
  {
    etiqueta: 'Mis entregas',
    titulo: 'Mis entregas',
    descripcion: 'Los pedidos asignados a usted, con su dirección y su punto en el mapa',
    ruta: '/entregas',
    icono: Bike,
    permiso: 'PEDIDO_LEER',
    cargos: [CARGO_REPARTIDOR],
    implementado: true,
  },
  {
    etiqueta: 'Pedidos',
    titulo: 'Pedidos',
    descripcion: 'Pedidos a domicilio, estados de entrega y reparto',
    ruta: '/pedidos',
    icono: ClipboardList,
    permiso: 'PEDIDO_LEER',
    implementado: true,
  },
  {
    etiqueta: 'Inventario',
    titulo: 'Inventario',
    descripcion: 'Insumos, almacenes y niveles de existencias',
    ruta: '/inventario',
    icono: Boxes,
    permiso: 'STOCK_CONSULTAR',
    implementado: true,
  },
  {
    etiqueta: 'Usuarios',
    titulo: 'Usuarios',
    descripcion: 'Altas, bajas, edición y desbloqueo de cuentas',
    ruta: '/usuarios',
    icono: Users,
    permiso: 'USUARIO_LEER',
    implementado: true,
  },
  {
    etiqueta: 'Roles y permisos',
    titulo: 'Roles y permisos',
    descripcion: 'Define qué puede hacer cada rol del sistema',
    ruta: '/roles',
    icono: ShieldCheck,
    permiso: 'ROL_LEER',
    implementado: true,
  },
  {
    etiqueta: 'Ventas',
    titulo: 'Ventas',
    descripcion: 'Punto de venta, historial y fichas de clientes',
    ruta: '/ventas',
    icono: ShoppingBag,
    permiso: 'VENTA_LEER',
    implementado: true,
  },
  {
    etiqueta: 'Producción',
    titulo: 'Producción',
    descripcion: 'Productos, recetas e información nutricional',
    ruta: '/produccion',
    icono: ChefHat,
    permiso: 'PRODUCTO_GESTIONAR',
    implementado: true,
  },
];

/**
 * Filtra los módulos a los que el usuario tiene acceso.
 *
 * RF-SEG-08: "El sistema debe restringir el acceso a cada módulo y operación
 * según los permisos asignados al usuario." Un módulo sin permiso no se muestra
 * en absoluto: mostrarlo deshabilitado revelaría la estructura del sistema.
 */
export function modulosAccesibles(
  tienePermiso: (permiso: string) => boolean,
  cargo?: string | null,
): Modulo[] {
  return MODULOS.filter(
    (m) =>
      (m.permiso === null || tienePermiso(m.permiso)) &&
      // Sin cargo conocido (una sesión anterior) decide solo el permiso.
      (!m.cargos || cargo === undefined || (cargo !== null && m.cargos.includes(cargo))),
  );
}
