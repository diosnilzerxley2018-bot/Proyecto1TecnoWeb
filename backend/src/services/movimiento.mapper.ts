import type { NotaIngresoConsultada } from '../models/nota-ingreso.model.js';
import type { NotaEgresoConsultada } from '../models/nota-egreso.model.js';
import type {
  LineaMovimientoDTO,
  NotaEgresoDTO,
  NotaIngresoDTO,
} from '../dtos/movimiento.dto.js';
import type { MotivoEgreso, MotivoIngreso } from '../config/dominio.js';

/**
 * Traducción de las notas de inventario a DTO.
 *
 * Ingreso y egreso comparten la forma de línea; la diferencia es que el egreso
 * no registra costo, porque el esquema no lo declara en sus detalles: una
 * salida por merma o ajuste no tiene precio de compra que anotar.
 */

/** Los productos terminados se cuentan en unidades; el esquema los declara enteros. */
const UNIDAD_PRODUCTO = 'u';

function nombreCompleto(usuario: { nombre: string; apellido: string }): string {
  return `${usuario.nombre} ${usuario.apellido}`;
}

/** Importe con dos decimales, calculado en centavos para no arrastrar error. */
function subtotal(cantidad: number, costoUnitario: number): number {
  return Math.round(cantidad * costoUnitario * 100) / 100;
}

export function aNotaIngresoDTO(nota: NotaIngresoConsultada): NotaIngresoDTO {
  const insumos: LineaMovimientoDTO[] = nota.detalle_ingreso_insumo.map((d) => {
    const cantidad = Number(d.cantidad);
    const costoUnitario = Number(d.costo_unitario);
    return {
      tipo: 'insumo',
      id: d.id_ingrediente,
      nombre: d.ingrediente_almacen.ingrediente.nombre,
      unidad: d.ingrediente_almacen.ingrediente.unidad_medida.abreviatura,
      idAlmacen: d.id_almacen,
      almacen: d.ingrediente_almacen.almacen.nombre,
      cantidad,
      costoUnitario,
      subtotal: subtotal(cantidad, costoUnitario),
    };
  });

  const productos: LineaMovimientoDTO[] = nota.detalle_ingreso_producto.map((d) => {
    const costoUnitario = Number(d.costo_unitario);
    return {
      tipo: 'producto',
      id: d.id_producto,
      nombre: d.producto_almacen.producto.nombre,
      unidad: UNIDAD_PRODUCTO,
      idAlmacen: d.id_almacen,
      almacen: d.producto_almacen.almacen.nombre,
      cantidad: d.cantidad,
      costoUnitario,
      subtotal: subtotal(d.cantidad, costoUnitario),
    };
  });

  return {
    id: nota.id_nota_ingreso,
    fecha: nota.fecha.toISOString(),
    motivo: nota.motivo as MotivoIngreso,
    proveedor: nota.proveedor,
    numeroDocumento: nota.numero_documento,
    total: Number(nota.total),
    registradoPor: {
      id: nota.empleado.id_empleado,
      nombreCompleto: nombreCompleto(nota.empleado.usuario),
    },
    lineas: [...insumos, ...productos],
  };
}

export function aNotaEgresoDTO(nota: NotaEgresoConsultada): NotaEgresoDTO {
  const insumos: LineaMovimientoDTO[] = nota.detalle_egreso_insumo.map((d) => ({
    tipo: 'insumo',
    id: d.id_ingrediente,
    nombre: d.ingrediente_almacen.ingrediente.nombre,
    unidad: d.ingrediente_almacen.ingrediente.unidad_medida.abreviatura,
    idAlmacen: d.id_almacen,
    almacen: d.ingrediente_almacen.almacen.nombre,
    cantidad: Number(d.cantidad),
    costoUnitario: null,
    subtotal: null,
  }));

  const productos: LineaMovimientoDTO[] = nota.detalle_egreso_producto.map((d) => ({
    tipo: 'producto',
    id: d.id_producto,
    nombre: d.producto_almacen.producto.nombre,
    unidad: UNIDAD_PRODUCTO,
    idAlmacen: d.id_almacen,
    almacen: d.producto_almacen.almacen.nombre,
    cantidad: d.cantidad,
    costoUnitario: null,
    subtotal: null,
  }));

  return {
    id: nota.id_nota_egreso,
    fecha: nota.fecha.toISOString(),
    motivo: nota.motivo as MotivoEgreso,
    observacion: nota.observacion,
    registradoPor: {
      id: nota.empleado.id_empleado,
      nombreCompleto: nombreCompleto(nota.empleado.usuario),
    },
    lineas: [...insumos, ...productos],
  };
}
