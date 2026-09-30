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
export const MOTIVOS_INGRESO_MANUAL: MotivoIngreso[] = ['Compra', 'Reposicion', 'Ajuste', 'Devolucion'];
export const MOTIVOS_EGRESO_MANUAL: MotivoEgreso[] = ['Merma', 'Ajuste', 'Devolucion'];

/**
 * La devolución de un **ingreso** es lo que vuelve del cliente, y lo que se le
 * entregó es un producto terminado. La de un egreso —al proveedor— admite
 * insumos y productos.
 */
export const MOTIVO_SOLO_PRODUCTOS: MotivoIngreso = 'Devolucion';

export const ETIQUETA_MOTIVO: Record<string, string> = {
  Compra: 'Compra',
  Produccion: 'Producción',
  Ajuste: 'Ajuste',
  Devolucion: 'Devolución',
  Reposicion: 'Reposición',
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
  Reposicion: 'marca',
  Merma: 'peligro',
};

/**
 * Qué significa cada motivo, para el formulario de registro. Va por dirección
 * porque «Devolución» nombra dos movimientos opuestos: lo que vuelve del
 * cliente y lo que se le devuelve al proveedor.
 */
export const AYUDA_MOTIVO_INGRESO: Record<string, string> = {
  Compra: 'Mercadería recibida de un proveedor',
  Reposicion: 'El proveedor repone lo que se le devolvió, sin nuevo pago',
  Ajuste: 'Corrección de inventario tras un recuento',
  Devolucion: 'Productos terminados que vuelven del cliente',
};

export const AYUDA_MOTIVO_EGRESO: Record<string, string> = {
  Merma: 'Pérdida por deterioro, rotura o vencimiento',
  Ajuste: 'Corrección de inventario tras un recuento',
  Devolucion: 'Lo que se le devuelve al proveedor: vencido, dañado o equivocado',
};

/**
 * El número de una nota de ingreso: «ING-0012». Es también el número de su
 * lote, porque un lote es lo que entró junto en una nota (Inventario › Lotes).
 */
export const numeroDeIngreso = (id: number) => `ING-${String(id).padStart(4, '0')}`;

/**
 * De dónde vino un ingreso: el proveedor y su documento, o la orden.
 *
 * Una orden de producción firma su nota de ingreso con «OP-17» y la de egreso
 * con «Orden de producción 17»: en la lista, las dos mitades de la misma
 * orden parecían cosas distintas. Se leen igual; el dato guardado no cambia.
 */
export function detalleDeIngreso(nota: {
  motivo: string;
  proveedor: string | null;
  numeroDocumento: string | null;
}): string | null {
  const orden = /^OP-(\d+)$/.exec(nota.numeroDocumento ?? '');
  if (nota.motivo === 'Produccion' && orden) return `Orden de producción ${orden[1]}`;
  return [nota.proveedor, nota.numeroDocumento].filter(Boolean).join(' · ') || null;
}

/**
 * Un vencimiento `AAAA-MM-DD` como «09/10/2026». Sin pasar por `Date`: leída
 * como medianoche UTC, en La Paz la fecha caía el día anterior.
 */
export function formatearVencimiento(dia: string): string {
  const [anio, mes, d] = dia.split('-');
  return `${d}/${mes}/${anio}`;
}

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
