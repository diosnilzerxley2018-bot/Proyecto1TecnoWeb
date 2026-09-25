import * as loteModel from '../models/lote.model.js';
import * as stockModel from '../models/stock.model.js';
import type { ClientePrisma } from '../models/stock.model.js';
import { ErrorApp } from '../errors/error-app.js';
import { redondearCantidad } from '../utils/cantidad.js';

/**
 * Trazabilidad de lotes de insumos perecederos (hallazgo A6).
 *
 * Estas funciones son el **único** lugar donde se mueve la existencia de un
 * insumo: actualizan a la vez la cifra consolidada de `ingrediente_almacen` y
 * su desglose en `lote_almacen`, dentro de la misma transacción. Mantener las
 * dos en un solo sitio es lo que impide que divergan.
 */

export interface DatosLote {
  codigo: string | null;
  fechaVencimiento: Date;
}

/**
 * Suma existencias y, si el insumo controla vencimiento, las imputa a su lote.
 *
 * Un insumo que no controla vencimiento —harina, avena— no genera lote: su
 * existencia vive solo en la cifra consolidada.
 */
export async function ingresar(
  tx: ClientePrisma,
  datos: {
    idIngrediente: number;
    idAlmacen: number;
    cantidad: number;
    controlaVencimiento: boolean;
    lote: DatosLote | null;
    nombreInsumo: string;
  },
): Promise<void> {
  if (datos.controlaVencimiento && !datos.lote) {
    throw new ErrorApp(
      400,
      `El insumo "${datos.nombreInsumo}" es perecedero: indique su fecha de vencimiento`,
    );
  }

  await stockModel.incrementarInsumo(tx, datos.idIngrediente, datos.idAlmacen, datos.cantidad);

  if (!datos.lote) return;

  const idLote = await loteModel.obtenerOCrear(tx, {
    idIngrediente: datos.idIngrediente,
    codigo: datos.lote.codigo,
    fechaVencimiento: datos.lote.fechaVencimiento,
  });
  await loteModel.incrementar(tx, idLote, datos.idAlmacen, datos.cantidad);
}

export interface LoteConsumido {
  idLote: number;
  codigo: string | null;
  fechaVencimiento: Date;
  cantidad: number;
}

/**
 * Descuenta existencias consumiendo primero el lote que vence antes.
 *
 * Es el criterio FEFO —*first expired, first out*—, el correcto para comida
 * fresca. El reparto anterior tomaba del almacén con más existencias, que para
 * un perecedero es exactamente al revés de lo que conviene.
 *
 * Cuando el insumo no lleva lotes, se limita al descuento consolidado.
 */
export async function consumir(
  tx: ClientePrisma,
  datos: {
    idIngrediente: number;
    idAlmacen: number;
    cantidad: number;
    nombreInsumo: string;
  },
): Promise<LoteConsumido[]> {
  const aplicado = await stockModel.descontarInsumo(
    tx,
    datos.idIngrediente,
    datos.idAlmacen,
    datos.cantidad,
  );
  if (!aplicado) {
    throw new ErrorApp(
      409,
      `El stock de "${datos.nombreInsumo}" cambió durante la operación. Intente nuevamente.`,
    );
  }

  const lotes = await loteModel.disponiblesPorVencimiento(
    tx,
    datos.idIngrediente,
    datos.idAlmacen,
  );
  if (lotes.length === 0) return [];

  const consumidos: LoteConsumido[] = [];
  let restante = datos.cantidad;

  for (const fila of lotes) {
    if (restante <= 0) break;

    const disponible = Number(fila.stock_actual);
    const tomado = redondearCantidad(Math.min(restante, disponible));
    if (tomado <= 0) continue;

    const descontado = await loteModel.descontar(tx, fila.id_lote, datos.idAlmacen, tomado);
    if (!descontado) {
      throw new ErrorApp(
        409,
        `El lote de "${datos.nombreInsumo}" cambió durante la operación. Intente nuevamente.`,
      );
    }

    consumidos.push({
      idLote: fila.id_lote,
      codigo: fila.lote.codigo,
      fechaVencimiento: fila.lote.fecha_vencimiento,
      cantidad: tomado,
    });
    restante = redondearCantidad(restante - tomado);
  }

  /**
   * Si los lotes no cubren la salida, el insumo tiene existencia consolidada
   * sin lote asignado: son las cantidades ingresadas antes de que se activara
   * el control de vencimiento. Se permite y se avisa por el registro, en lugar
   * de bloquear una operación legítima.
   */
  return consumidos;
}
