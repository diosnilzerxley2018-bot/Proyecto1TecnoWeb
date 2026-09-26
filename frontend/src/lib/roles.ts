import type { Rol } from '@/types';
import { ROL_CLIENTE } from '@/lib/dominio';

/**
 * CU-SEG-03 — por qué un rol no se puede eliminar, o `null` si se puede.
 *
 * Es comodidad de interfaz: deshabilita el botón y explica el motivo **antes**
 * de que el administrador lo intente, en lugar de dejarlo pulsar y mostrarle
 * un error. La regla que manda es la del servidor (`rol.service.eliminar`);
 * esta la repite para que la pantalla no ofrezca lo que la API va a rechazar.
 */
export function motivoParaNoEliminar(rol: Pick<Rol, 'nombre' | 'cantidadUsuarios'>): string | null {
  if (rol.nombre === ROL_CLIENTE) {
    return 'El sistema usa este rol para el registro de clientes';
  }
  if (rol.cantidadUsuarios > 0) {
    return `Tiene ${rol.cantidadUsuarios} usuario(s): asígneles otro rol antes de eliminarlo`;
  }
  return null;
}

/**
 * Qué habilita cada permiso, en palabras, y a qué parte del sistema pertenece.
 *
 * El código (`PEDIDO_CERRAR_AJENO`) es el que verifica el servidor y el que
 * cita el informe; a quien arma un rol le sirve saber qué permite. Las
 * pantallas muestran la frase y, debajo, el código.
 */
const PERMISOS: Record<string, { grupo: string; descripcion: string }> = {
  USUARIO_LEER: { grupo: 'Usuarios y seguridad', descripcion: 'Ver los usuarios' },
  USUARIO_CREAR: { grupo: 'Usuarios y seguridad', descripcion: 'Crear usuarios' },
  USUARIO_EDITAR: { grupo: 'Usuarios y seguridad', descripcion: 'Editar usuarios y desbloquear cuentas' },
  USUARIO_BAJA: { grupo: 'Usuarios y seguridad', descripcion: 'Dar de baja y reactivar cuentas' },
  ROL_LEER: { grupo: 'Usuarios y seguridad', descripcion: 'Ver los roles y sus permisos' },
  ROL_GESTIONAR: { grupo: 'Usuarios y seguridad', descripcion: 'Crear, editar y eliminar roles' },
  PERMISO_ASIGNAR: { grupo: 'Usuarios y seguridad', descripcion: 'Habilitar o quitar permisos a un usuario' },
  CONFIGURACION_GESTIONAR: {
    grupo: 'Usuarios y seguridad',
    descripcion: 'Cambiar el modo de cobro y los datos del negocio',
  },
  VENTA_REGISTRAR: { grupo: 'Ventas', descripcion: 'Vender en el punto de venta y anular ventas' },
  VENTA_LEER: { grupo: 'Ventas', descripcion: 'Ver el historial y los reportes de ventas' },
  CLIENTE_GESTIONAR: { grupo: 'Ventas', descripcion: 'Ver y editar las fichas de clientes' },
  PEDIDO_LEER: { grupo: 'Pedidos', descripcion: 'Ver pedidos y sus reportes' },
  PEDIDO_GESTIONAR: { grupo: 'Pedidos', descripcion: 'Hacer pedidos y avanzar su estado' },
  PEDIDO_CERRAR_AJENO: { grupo: 'Pedidos', descripcion: 'Cerrar entregas de otro repartidor' },
  PRODUCTO_GESTIONAR: { grupo: 'Producción', descripcion: 'Gestionar productos y recetas' },
  ORDEN_PRODUCCION_GESTIONAR: {
    grupo: 'Producción',
    descripcion: 'Planificar y ejecutar órdenes de producción',
  },
  STOCK_CONSULTAR: { grupo: 'Inventario', descripcion: 'Consultar stock, movimientos y reportes' },
  INSUMO_GESTIONAR: { grupo: 'Inventario', descripcion: 'Crear y editar insumos' },
  ALMACEN_GESTIONAR: { grupo: 'Inventario', descripcion: 'Crear, editar y eliminar almacenes' },
  INGRESO_REGISTRAR: { grupo: 'Inventario', descripcion: 'Registrar ingresos (compras, ajustes)' },
  EGRESO_REGISTRAR: { grupo: 'Inventario', descripcion: 'Registrar egresos (mermas, ajustes)' },
};

/** El orden en que se presentan los grupos. */
const GRUPOS = ['Usuarios y seguridad', 'Ventas', 'Pedidos', 'Producción', 'Inventario', 'Otros'];

/** Qué permite un permiso, o el código mismo si es uno que la interfaz no conoce. */
export const describirPermiso = (codigo: string) => PERMISOS[codigo]?.descripcion ?? codigo;

/** Reparte una lista de permisos en sus grupos, en el orden de `GRUPOS`. */
export function agruparPermisos<T>(
  permisos: T[],
  codigoDe: (permiso: T) => string,
): { grupo: string; permisos: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const permiso of permisos) {
    const grupo = PERMISOS[codigoDe(permiso)]?.grupo ?? 'Otros';
    grupos.set(grupo, [...(grupos.get(grupo) ?? []), permiso]);
  }
  return GRUPOS.filter((g) => grupos.has(g)).map((grupo) => ({ grupo, permisos: grupos.get(grupo)! }));
}
