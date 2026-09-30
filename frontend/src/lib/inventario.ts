import type { ExistenciaStock, MotivoEgreso, MotivoIngreso, TipoItem } from '@/types';
import type { Tono } from '@/components/ui/Insignia';

/**
 * Vocabulario de los movimientos de inventario.
 *
 * Las dos listas de motivos no coinciden, y la diferencia es deliberada: no
 * existe el motivo "Venta" ni "Pedido" porque esas salidas ya quedan
 * documentadas por el detalle de la venta o del pedido, que registra el
 * almacén de origen. La nota de egreso documenta lo que no tiene otro respaldo.
 */

/**
 * Los motivos que se eligen al registrar una nota a mano. Producción no está:
 * lo escribe la orden de producción al finalizarse —descuenta los insumos e
 * ingresa el producto—, y cargarlo aquí también lo contaba dos veces. Las notas
 * de las órdenes se siguen mostrando con ese motivo en el listado.
 */
export const MOTIVOS_INGRESO_MANUAL: MotivoIngreso[] = ['Compra', 'Ajuste', 'Devolucion'];
export const MOTIVOS_EGRESO_MANUAL: MotivoEgreso[] = ['Merma', 'Ajuste'];

/** Lo que vuelve en una devolución es lo que se entregó: un producto terminado. */
export const MOTIVO_SOLO_PRODUCTOS: MotivoIngreso = 'Devolucion';

export const ETIQUETA_MOTIVO: Record<string, string> = {
  Compra: 'Compra',
  Produccion: 'Producción',
  Ajuste: 'Ajuste',
  Devolucion: 'Devolución',
  Merma: 'Merma',
  // No son motivos de nota: son las salidas que documentan la venta y el
  // pedido, y el reporte de movimientos las muestra junto a las notas.
  Venta: 'Venta',
  Pedido: 'Pedido',
};

export const TONO_MOTIVO: Record<string, Tono> = {
  Compra: 'marca',
  Produccion: 'violeta',
  Ajuste: 'info',
  Devolucion: 'aviso',
  Merma: 'peligro',
};

/** Descripción de qué significa cada motivo, para el formulario de registro. */
export const AYUDA_MOTIVO: Record<string, string> = {
  Compra: 'Mercadería recibida de un proveedor',
  Ajuste: 'Corrección de inventario tras un recuento',
  Devolucion: 'Productos terminados que vuelven tras entregarse',
  Merma: 'Pérdida por deterioro, rotura o vencimiento',
};

/** Un ítem guardado en un almacén. */
export interface LineaAlmacen {
  tipo: TipoItem;
  id: number;
  nombre: string;
  unidad: string;
  /** Lo que hay en este almacén. */
  stock: number;
  /** Lo que hay sumando todos: es contra esto que se decide la reposición. */
  stockGeneral: number;
  bajoMinimo: boolean;
}

/**
 * Qué guarda un almacén, a partir del stock de todos.
 *
 * Una sola consulta de stock alcanza para todas las tarjetas: cada ítem trae
 * sus existencias por almacén, y aquí se reparten. Solo entra lo que tiene
 * existencias en ese almacén: un ítem en cero no está guardado ahí.
 */
export function contenidoDelAlmacen(
  existencias: ExistenciaStock[],
  idAlmacen: number,
): LineaAlmacen[] {
  return existencias.flatMap((item) => {
    const aqui = item.existencias.find((e) => e.idAlmacen === idAlmacen);
    if (!aqui || aqui.stock <= 0) return [];
    return [
      {
        tipo: item.tipo,
        id: item.id,
        nombre: item.nombre,
        unidad: item.unidad,
        stock: aqui.stock,
        stockGeneral: item.stockGeneral,
        bajoMinimo: item.bajoMinimo,
      },
    ];
  });
}
