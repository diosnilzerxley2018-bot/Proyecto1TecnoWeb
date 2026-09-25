import * as stockModel from '../models/stock.model.js';
import type { ClientePrisma } from '../models/stock.model.js';
import { ErrorApp } from '../errors/error-app.js';
import { redondearCantidad } from '../utils/cantidad.js';

/**
 * CU-INV-06 — Verificar Disponibilidad de Stock.
 *
 * Es el caso de uso incluido por Gestionar Venta, Gestionar Pedido,
 * Gestionar Orden de Producción y Gestionar Egreso. Se implementa una sola
 * vez y los cuatro flujos lo invocan: esa unicidad es, en el código, lo que
 * la relación «include» expresa en el modelo.
 */

/** Lo que el cliente pide: un producto y una cantidad. */
export interface LineaSolicitada {
  idProducto: number;
  cantidad: number;
}

/** De qué almacén sale cada unidad. Un producto puede repartirse entre almacenes. */
export interface Asignacion {
  idProducto: number;
  idAlmacen: number;
  cantidad: number;
}

interface Faltante {
  descripcion: string;
  solicitado: number;
  disponible: number;
}

/**
 * Resuelve el origen de cada línea o falla indicando la cantidad disponible.
 *
 * `detalle_pedido` tiene clave primaria (pedido, producto, almacén), por lo
 * que una misma línea puede cubrirse desde varios almacenes. Se toma primero
 * del almacén con más existencias para minimizar la fragmentación.
 */
export async function verificarDisponibilidad(
  lineas: LineaSolicitada[],
  tx: ClientePrisma,
): Promise<Asignacion[]> {
  if (lineas.length === 0) {
    throw new ErrorApp(400, 'El pedido no contiene productos');
  }

  const existencias = await stockModel.existenciasDeProductos(
    lineas.map((l) => l.idProducto),
    tx,
  );

  const asignaciones: Asignacion[] = [];
  const faltantes: Faltante[] = [];

  for (const linea of lineas) {
    const delProducto = existencias.filter((e) => e.id_producto === linea.idProducto);
    let restante = linea.cantidad;

    for (const existencia of delProducto) {
      if (restante === 0) break;
      const tomado = Math.min(restante, existencia.stock_actual);
      if (tomado > 0) {
        asignaciones.push({
          idProducto: linea.idProducto,
          idAlmacen: existencia.id_almacen,
          cantidad: tomado,
        });
        restante -= tomado;
      }
    }

    if (restante > 0) {
      faltantes.push({
        descripcion: `producto ${linea.idProducto}`,
        solicitado: linea.cantidad,
        disponible: linea.cantidad - restante,
      });
    }
  }

  if (faltantes.length > 0) {
    throw new ErrorApp(409, mensajeDeFaltantes(faltantes));
  }

  return asignaciones;
}

/** CU-INV-04 y CU-PED-02 exigen informar la cantidad realmente disponible. */
function mensajeDeFaltantes(faltantes: Faltante[]): string {
  const detalle = faltantes
    .map((f) => `${f.descripcion}: solicitado ${f.solicitado}, disponible ${f.disponible}`)
    .join('; ');
  return `Stock insuficiente. ${detalle}`;
}

/**
 * Aplica el descuento de existencias resuelto por `verificarDisponibilidad`.
 *
 * Se ejecuta dentro de la misma transacción: si otra operación consumió el
 * stock entre la verificación y el descuento, el UPDATE condicional no afecta
 * ninguna fila y la transacción completa se revierte.
 */
export async function descontarAsignaciones(
  asignaciones: Asignacion[],
  tx: ClientePrisma,
): Promise<void> {
  for (const asignacion of asignaciones) {
    const aplicado = await stockModel.descontar(
      tx,
      asignacion.idProducto,
      asignacion.idAlmacen,
      asignacion.cantidad,
    );
    if (!aplicado) {
      throw new ErrorApp(
        409,
        `El stock del producto ${asignacion.idProducto} cambió durante la operación. Intente nuevamente.`,
      );
    }
  }
}

/** Devuelve al inventario las existencias de un pedido cancelado. */
export async function reponerAsignaciones(
  asignaciones: Asignacion[],
  tx: ClientePrisma,
): Promise<void> {
  for (const asignacion of asignaciones) {
    await stockModel.reponer(tx, asignacion.idProducto, asignacion.idAlmacen, asignacion.cantidad);
  }
}

/* ------------------------------------------------------------------ */
/* Verificación con almacén indicado — CU-INV-04 Gestionar Egreso       */
/* ------------------------------------------------------------------ */

/**
 * Segunda forma de invocar el mismo caso de uso incluido.
 *
 * En un pedido o una venta el cliente no elige almacén, así que el sistema
 * resuelve el origen (`verificarDisponibilidad`). En un egreso el empleado
 * indica el almacén de origen de cada línea, de modo que no hay nada que
 * resolver: solo hay que comprobar que esa combinación tenga existencias
 * suficientes.
 */
export interface LineaConAlmacen {
  idItem: number;
  idAlmacen: number;
  cantidad: number;
}

function recolectarFaltantes(
  lineas: LineaConAlmacen[],
  existencias: { idItem: number; idAlmacen: number; stock: number }[],
  etiqueta: string,
): Faltante[] {
  return lineas.flatMap((linea) => {
    const existencia = existencias.find(
      (e) => e.idItem === linea.idItem && e.idAlmacen === linea.idAlmacen,
    );
    const disponible = existencia?.stock ?? 0;
    if (disponible >= linea.cantidad) return [];
    return [
      {
        descripcion: `${etiqueta} ${linea.idItem} en almacén ${linea.idAlmacen}`,
        solicitado: linea.cantidad,
        disponible,
      },
    ];
  });
}

export async function verificarExistenciaEnAlmacen(
  productos: LineaConAlmacen[],
  insumos: LineaConAlmacen[],
  tx: ClientePrisma,
): Promise<void> {
  if (productos.length === 0 && insumos.length === 0) {
    throw new ErrorApp(400, 'El egreso no contiene ítems');
  }

  const [existenciasProducto, existenciasInsumo] = [
    productos.length > 0
      ? await stockModel.existenciasDeProductos(
          productos.map((l) => l.idItem),
          tx,
        )
      : [],
    insumos.length > 0
      ? await stockModel.existenciasDeInsumos(
          insumos.map((l) => l.idItem),
          tx,
        )
      : [],
  ];

  const faltantes = [
    ...recolectarFaltantes(
      productos,
      existenciasProducto.map((e) => ({
        idItem: e.id_producto,
        idAlmacen: e.id_almacen,
        stock: e.stock_actual,
      })),
      'producto',
    ),
    ...recolectarFaltantes(
      insumos,
      existenciasInsumo.map((e) => ({
        idItem: e.id_ingrediente,
        idAlmacen: e.id_almacen,
        stock: Number(e.stock_actual),
      })),
      'insumo',
    ),
  ];

  if (faltantes.length > 0) {
    throw new ErrorApp(409, mensajeDeFaltantes(faltantes));
  }
}

/* ------------------------------------------------------------------ */
/* Reparto de insumos — CU-PRO-02 Gestionar Orden de Producción         */
/* ------------------------------------------------------------------ */

export interface Requerimiento {
  idItem: number;
  cantidad: number;
}

export interface FaltanteInsumo {
  idItem: number;
  solicitado: number;
  disponible: number;
}

/**
 * Resuelve de qué almacenes salen los insumos requeridos, sin lanzar.
 *
 * Devuelve también lo que falta, para que quien la invoque pueda componer el
 * mensaje con los nombres de los insumos: CU-PRO-02 exige informar *qué insumo
 * falta y en qué cantidad*, y esta capa solo conoce identificadores.
 *
 * Es la misma lógica de reparto que usa el pedido, aplicada a la otra tabla de
 * existencias. Se toma primero del almacén con más stock para fragmentar menos.
 */
export async function asignarInsumos(
  requerimientos: Requerimiento[],
  tx: ClientePrisma,
): Promise<{ asignaciones: Asignacion[]; faltantes: FaltanteInsumo[] }> {
  const existencias = await stockModel.existenciasDeInsumos(
    requerimientos.map((r) => r.idItem),
    tx,
  );

  const asignaciones: Asignacion[] = [];
  const faltantes: FaltanteInsumo[] = [];

  for (const requerimiento of requerimientos) {
    const disponibles = existencias.filter((e) => e.id_ingrediente === requerimiento.idItem);
    let restante = requerimiento.cantidad;

    for (const existencia of disponibles) {
      if (restante <= 0) break;
      const tomado = Math.min(restante, Number(existencia.stock_actual));
      if (tomado > 0) {
        asignaciones.push({
          idProducto: requerimiento.idItem,
          idAlmacen: existencia.id_almacen,
          cantidad: redondearCantidad(tomado),
        });
        restante = redondearCantidad(restante - tomado);
      }
    }

    if (restante > 0) {
      faltantes.push({
        idItem: requerimiento.idItem,
        solicitado: requerimiento.cantidad,
        disponible: redondearCantidad(requerimiento.cantidad - restante),
      });
    }
  }

  return { asignaciones, faltantes };
}
