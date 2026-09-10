import type { Prisma } from '@prisma/client';

/**
 * Capa Model — clase de análisis tblProductoAlmacen.
 *
 * Las operaciones aceptan un cliente de transacción para poder ejecutarse
 * dentro del `$transaction` que confirma un pedido: la verificación y el
 * descuento deben ser atómicos respecto de otros pedidos concurrentes.
 */

/** Cliente de Prisma o transacción en curso. */
export type ClientePrisma = Prisma.TransactionClient;

export const existenciasDeProductos = (idsProducto: number[], tx: ClientePrisma) =>
  tx.producto_almacen.findMany({
    where: { id_producto: { in: idsProducto } },
    select: { id_producto: true, id_almacen: true, stock_actual: true },
    orderBy: [{ id_producto: 'asc' }, { stock_actual: 'desc' }],
  });

/**
 * Descuenta existencias de forma atómica.
 *
 * La condición `stock_actual >= cantidad` viaja dentro del propio UPDATE, de
 * modo que dos pedidos simultáneos sobre la última unidad no pueden ambos
 * tener éxito. Devuelve `false` si otra transacción se adelantó.
 */
export async function descontar(
  tx: ClientePrisma,
  idProducto: number,
  idAlmacen: number,
  cantidad: number,
): Promise<boolean> {
  const { count } = await tx.producto_almacen.updateMany({
    where: { id_producto: idProducto, id_almacen: idAlmacen, stock_actual: { gte: cantidad } },
    data: { stock_actual: { decrement: cantidad } },
  });
  return count === 1;
}

/** Repone existencias al cancelarse un pedido (CU-PED-02, excepciones). */
export async function reponer(
  tx: ClientePrisma,
  idProducto: number,
  idAlmacen: number,
  cantidad: number,
): Promise<void> {
  await tx.producto_almacen.update({
    where: { id_producto_id_almacen: { id_producto: idProducto, id_almacen: idAlmacen } },
    data: { stock_actual: { increment: cantidad } },
  });
}

/* ------------------------------------------------------------------ */
/* Insumos — clase de análisis tblIngredienteAlmacen                    */
/* ------------------------------------------------------------------ */

export const existenciasDeInsumos = (idsInsumo: number[], tx: ClientePrisma) =>
  tx.ingrediente_almacen.findMany({
    where: { id_ingrediente: { in: idsInsumo } },
    select: { id_ingrediente: true, id_almacen: true, stock_actual: true },
    orderBy: [{ id_ingrediente: 'asc' }, { stock_actual: 'desc' }],
  });

/** Descuento atómico, con la condición de suficiencia dentro del propio UPDATE. */
export async function descontarInsumo(
  tx: ClientePrisma,
  idIngrediente: number,
  idAlmacen: number,
  cantidad: number,
): Promise<boolean> {
  const { count } = await tx.ingrediente_almacen.updateMany({
    where: { id_ingrediente: idIngrediente, id_almacen: idAlmacen, stock_actual: { gte: cantidad } },
    data: { stock_actual: { increment: -cantidad } },
  });
  return count === 1;
}

/* ------------------------------------------------------------------ */
/* Incrementos — CU-INV-03 Gestionar Ingreso                            */
/* ------------------------------------------------------------------ */

/**
 * Suma existencias creando la fila de stock si todavía no existe.
 *
 * Es imprescindible: `detalle_ingreso_insumo` y `detalle_ingreso_producto`
 * tienen clave foránea hacia la fila `(ítem, almacén)` de la tabla de stock,
 * de modo que el primer ingreso de un insumo a un almacén fallaría si la fila
 * no se crea antes. Por eso el incremento precede al alta del detalle.
 */
export const incrementarProducto = (
  tx: ClientePrisma,
  idProducto: number,
  idAlmacen: number,
  cantidad: number,
) =>
  tx.producto_almacen.upsert({
    where: { id_producto_id_almacen: { id_producto: idProducto, id_almacen: idAlmacen } },
    update: { stock_actual: { increment: cantidad } },
    create: { id_producto: idProducto, id_almacen: idAlmacen, stock_actual: cantidad },
  });

export const incrementarInsumo = (
  tx: ClientePrisma,
  idIngrediente: number,
  idAlmacen: number,
  cantidad: number,
) =>
  tx.ingrediente_almacen.upsert({
    where: { id_ingrediente_id_almacen: { id_ingrediente: idIngrediente, id_almacen: idAlmacen } },
    update: { stock_actual: { increment: cantidad } },
    create: { id_ingrediente: idIngrediente, id_almacen: idAlmacen, stock_actual: cantidad },
  });

/** Asegura la fila de stock en cero, sin alterar la existencia si ya existe. */
export const asegurarFilaProducto = (tx: ClientePrisma, idProducto: number, idAlmacen: number) =>
  tx.producto_almacen.upsert({
    where: { id_producto_id_almacen: { id_producto: idProducto, id_almacen: idAlmacen } },
    update: {},
    create: { id_producto: idProducto, id_almacen: idAlmacen, stock_actual: 0 },
  });

export const asegurarFilaInsumo = (tx: ClientePrisma, idIngrediente: number, idAlmacen: number) =>
  tx.ingrediente_almacen.upsert({
    where: { id_ingrediente_id_almacen: { id_ingrediente: idIngrediente, id_almacen: idAlmacen } },
    update: {},
    create: { id_ingrediente: idIngrediente, id_almacen: idAlmacen, stock_actual: 0 },
  });
