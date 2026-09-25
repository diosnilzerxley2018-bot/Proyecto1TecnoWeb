import type { PedidoConDetalle } from '../models/pedido.model.js';
import type {
  EstadoPedido,
  LineaPedidoDTO,
  MetodoPago,
  PedidoDetalleDTO,
  PedidoResumenDTO,
} from '../dtos/pedido.dto.js';
import { esCancelable, type MotivoCancelacion } from '../config/dominio.js';

/**
 * Traducción de fila de base de datos a DTO, compartida por los dos servicios
 * que realizan CU-PED-02: el del cliente y el del personal. Vive aparte para
 * que ninguno de los dos dependa del otro solo por reutilizar el mapeo.
 */

/**
 * Suma en centavos para evitar el arrastre de error del punto flotante y
 * devuelve el importe con dos decimales.
 */
export function calcularTotal(lineas: { cantidad: number; precioUnitario: number }[]): number {
  const centavos = lineas.reduce(
    (total, l) => total + Math.round(l.precioUnitario * 100) * l.cantidad,
    0,
  );
  return centavos / 100;
}

/**
 * Campos comunes a toda respuesta de pedido. **No es una respuesta por sí
 * mismo** y por eso no se exporta: ningún endpoint devuelve el resumen pelado.
 * Servirlo fue la causa de que «Mis pedidos» reventara al pintar la dirección
 * de un pedido que no la traía.
 */
function aResumenDTO(pedido: PedidoConDetalle): PedidoResumenDTO {
  const estado = pedido.estado_pedido as EstadoPedido;
  return {
    id: pedido.id_pedido,
    fecha: pedido.fecha.toISOString(),
    estadoPedido: estado,
    estadoPago: pedido.estado_pago,
    metodoPago: pedido.metodo_pago as MetodoPago,
    total: Number(pedido.total),
    fechaEntrega: pedido.fecha_entrega?.toISOString() ?? null,
    cancelable: esCancelable(estado),
    motivoCancelacion: (pedido.motivo_cancelacion as MotivoCancelacion | null) ?? null,
  };
}

/**
 * Une las líneas del mismo producto que salieron de distintos almacenes.
 *
 * `detalle_pedido` tiene clave primaria (pedido, producto, almacén): pedir 7
 * unidades tomando 6 de un almacén y 1 de otro produce **dos filas del mismo
 * producto**. El cliente no elige almacén y el DTO tampoco lo expone, de modo
 * que esas dos filas se le presentarían como el mismo producto repetido, sin
 * nada que las distinga. El desglose sigue en la base para el inventario.
 */
export function aDetalleDTO(pedido: PedidoConDetalle): PedidoDetalleDTO {
  const porProducto = new Map<number, LineaPedidoDTO>();

  for (const d of pedido.detalle_pedido) {
    const precioUnitario = Number(d.precio_unitario);
    const previa = porProducto.get(d.id_producto);

    if (previa) {
      previa.cantidad += d.cantidad;
      previa.subtotal = calcularTotal([{ cantidad: previa.cantidad, precioUnitario }]);
      continue;
    }

    porProducto.set(d.id_producto, {
      idProducto: d.id_producto,
      nombre: d.producto_almacen.producto.nombre,
      cantidad: d.cantidad,
      precioUnitario,
      subtotal: calcularTotal([{ cantidad: d.cantidad, precioUnitario }]),
    });
  }

  const items: LineaPedidoDTO[] = [...porProducto.values()];

  return {
    ...aResumenDTO(pedido),
    referenciaPago: pedido.referencia_pago,
    ubicacion: {
      calle: pedido.ubicacion.calle,
      numero: pedido.ubicacion.numero,
      referencia: pedido.ubicacion.referencia,
      latitud: pedido.ubicacion.latitud === null ? null : Number(pedido.ubicacion.latitud),
      longitud: pedido.ubicacion.longitud === null ? null : Number(pedido.ubicacion.longitud),
    },
    items,
  };
}
