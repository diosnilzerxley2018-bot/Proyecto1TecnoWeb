import { CARGO_REPARTIDOR } from './dominio';
import {
  ArrowLeftRight,
  Bike,
  Boxes,
  ChartColumn,
  ChefHat,
  ClipboardList,
  Factory,
  Gauge,
  History,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

/**
 * Catálogo único de módulos del sistema.
 *
 * Lo consumen la barra lateral, la pantalla principal, las pestañas de cada
 * módulo y el buscador general, para que todos muestren siempre lo mismo sin
 * duplicar la definición.
 */

/** Una pantalla dentro de un módulo: lo que el módulo muestra como pestaña. */
export interface Seccion {
  ruta: string;
  etiqueta: string;
  icono: LucideIcon;
  /** Permiso propio de la pestaña. Sin él, basta el del módulo. */
  permiso?: string;
  /** Otras palabras con las que el buscador general encuentra la pantalla. */
  alias?: string;
}

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
  /** Sus pestañas, si tiene más de una pantalla. */
  secciones?: Seccion[];
  /** Otras palabras con las que el buscador general encuentra el módulo. */
  alias?: string;
}

const REPORTES = { etiqueta: 'Reportes', icono: ChartColumn, alias: 'informe pdf periodo' };

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
    alias: 'reparto repartidor mapa entregar',
  },
  {
    etiqueta: 'Pedidos',
    titulo: 'Pedidos',
    descripcion: 'Pedidos a domicilio, estados de entrega y reparto',
    ruta: '/pedidos',
    icono: ClipboardList,
    permiso: 'PEDIDO_LEER',
    implementado: true,
    secciones: [
      {
        ruta: '/pedidos/lista',
        etiqueta: 'Pedidos',
        icono: ClipboardList,
        alias: 'domicilio tablero estados reparto',
      },
      { ruta: '/pedidos/reportes', ...REPORTES },
    ],
  },
  {
    etiqueta: 'Inventario',
    titulo: 'Inventario',
    descripcion: 'Insumos, almacenes y niveles de existencias',
    ruta: '/inventario',
    icono: Boxes,
    permiso: 'STOCK_CONSULTAR',
    implementado: true,
    secciones: [
      {
        ruta: '/inventario/stock',
        etiqueta: 'Stock',
        icono: Gauge,
        alias: 'existencias alertas reponer vencimientos lotes',
      },
      {
        ruta: '/inventario/movimientos',
        etiqueta: 'Movimientos',
        icono: ArrowLeftRight,
        alias: 'ingreso egreso compra merma nota',
      },
      { ruta: '/inventario/insumos', etiqueta: 'Insumos', icono: Boxes, alias: 'materia prima' },
      {
        ruta: '/inventario/almacenes',
        etiqueta: 'Almacenes',
        icono: Warehouse,
        alias: 'deposito camara',
      },
      { ruta: '/inventario/reportes', ...REPORTES },
    ],
  },
  {
    etiqueta: 'Usuarios',
    titulo: 'Usuarios',
    descripcion: 'Altas, bajas, edición y desbloqueo de cuentas',
    ruta: '/usuarios',
    icono: Users,
    permiso: 'USUARIO_LEER',
    implementado: true,
    alias: 'cuentas empleados desbloquear bajas',
  },
  {
    etiqueta: 'Roles y permisos',
    titulo: 'Roles y permisos',
    descripcion: 'Define qué puede hacer cada rol del sistema',
    ruta: '/roles',
    icono: ShieldCheck,
    permiso: 'ROL_LEER',
    implementado: true,
    alias: 'seguridad accesos',
  },
  {
    etiqueta: 'Ventas',
    titulo: 'Ventas',
    descripcion: 'Punto de venta, historial y fichas de clientes',
    ruta: '/ventas',
    icono: ShoppingBag,
    permiso: 'VENTA_LEER',
    implementado: true,
    secciones: [
      {
        ruta: '/ventas/registro',
        etiqueta: 'Punto de venta',
        icono: ScanLine,
        permiso: 'VENTA_REGISTRAR',
        alias: 'vender caja cobrar registrar venta mostrador',
      },
      {
        ruta: '/ventas/historial',
        etiqueta: 'Historial',
        icono: History,
        permiso: 'VENTA_LEER',
        alias: 'comprobante anular ventas',
      },
      {
        ruta: '/ventas/clientes',
        etiqueta: 'Clientes',
        icono: Users,
        permiso: 'CLIENTE_GESTIONAR',
        alias: 'fichas preferencias',
      },
      { ruta: '/ventas/reportes', ...REPORTES, permiso: 'VENTA_LEER' },
    ],
  },
  {
    etiqueta: 'Producción',
    titulo: 'Producción',
    descripcion: 'Productos, recetas e información nutricional',
    ruta: '/produccion',
    icono: ChefHat,
    permiso: 'PRODUCTO_GESTIONAR',
    implementado: true,
    secciones: [
      {
        ruta: '/produccion/productos',
        etiqueta: 'Productos',
        icono: ChefHat,
        permiso: 'PRODUCTO_GESTIONAR',
        alias: 'recetas nutricion catalogo precios',
      },
      {
        ruta: '/produccion/ordenes',
        etiqueta: 'Órdenes',
        icono: Factory,
        permiso: 'ORDEN_PRODUCCION_GESTIONAR',
        alias: 'producir cocina orden de produccion',
      },
      { ruta: '/produccion/reportes', ...REPORTES, permiso: 'ORDEN_PRODUCCION_GESTIONAR' },
    ],
  },
];

/** Las pestañas de un módulo, tal como están declaradas. */
export function seccionesDe(ruta: string): Seccion[] {
  return MODULOS.find((m) => m.ruta === ruta)?.secciones ?? [];
}

/** Las pestañas de un módulo que el usuario puede abrir. */
export function seccionesAccesibles(
  ruta: string,
  tienePermiso: (permiso: string) => boolean,
): Seccion[] {
  return seccionesDe(ruta).filter((s) => !s.permiso || tienePermiso(s.permiso));
}

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

/** Un lugar al que se puede ir desde el buscador general. */
export interface Destino {
  ruta: string;
  etiqueta: string;
  /** El módulo al que pertenece, cuando es una de sus pestañas. */
  modulo: string | null;
  icono: LucideIcon;
  /** Todo el texto por el que se lo encuentra. */
  texto: string;
}

/**
 * Las pantallas a las que el usuario puede ir, para el buscador general.
 *
 * Un módulo con pestañas aporta una por pestaña —«Punto de venta» se busca
 * como tal, no como «Ventas»—; uno sin pestañas se aporta a sí mismo. Sale
 * de los mismos filtros que la barra lateral: nadie encuentra una pantalla
 * que no podría abrir.
 */
export function destinosAccesibles(
  tienePermiso: (permiso: string) => boolean,
  cargo?: string | null,
): Destino[] {
  return modulosAccesibles(tienePermiso, cargo)
    .filter((m) => m.implementado)
    .flatMap((m): Destino[] => {
      const secciones = seccionesAccesibles(m.ruta, tienePermiso);
      if (secciones.length === 0) {
        return [
          {
            ruta: m.ruta,
            etiqueta: m.titulo,
            modulo: null,
            icono: m.icono,
            texto: `${m.titulo} ${m.descripcion} ${m.alias ?? ''}`,
          },
        ];
      }
      return secciones.map((s) => ({
        ruta: s.ruta,
        etiqueta: s.etiqueta,
        modulo: m.etiqueta,
        icono: s.icono,
        texto: `${m.etiqueta} ${s.etiqueta} ${s.alias ?? ''}`,
      }));
    });
}

/**
 * Los módulos de trabajo de cada cargo: los que el inicio pone primero.
 *
 * Todos los empleados comparten el rol Empleado y ven los mismos módulos, y
 * el inicio se los mostraba iguales: al cocinero, Ventas pesaba lo mismo que
 * Producción. No quita nada —eso lo deciden los permisos—: ordena.
 */
const PRINCIPALES_POR_CARGO: Record<string, string[]> = {
  Vendedor: ['/ventas', '/pedidos'],
  Cocinero: ['/pedidos', '/produccion'],
  Almacenero: ['/inventario'],
  [CARGO_REPARTIDOR]: ['/entregas'],
};

/** Las rutas de los módulos principales de un cargo; ninguna si no tiene. */
export function principalesPara(cargo?: string | null): string[] {
  return (cargo && PRINCIPALES_POR_CARGO[cargo]) || [];
}
