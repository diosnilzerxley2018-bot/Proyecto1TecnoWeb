import * as insumoModel from '../models/insumo.model.js';
import * as stockModel from '../models/stock.model.js';
import type { ClientePrisma } from '../models/stock.model.js';
import { dosDecimales } from '../utils/dinero.js';

/**
 * Cómo se actualiza el costo de un insumo cuando se compra (CU-INV-03).
 *
 * Vive en un archivo propio porque es **una regla de negocio con nombre** —el
 * método de costeo—, no un detalle del registro de la nota. Cambiarla por FIFO
 * o por costo estándar es cambiar este archivo, no buscar multiplicaciones
 * repartidas por los servicios.
 *
 * El problema que resuelve: `ingrediente.costo_unitario` se cargaba a mano al
 * dar de alta el insumo y no volvía a moverse nunca. Cada compra sí guardaba
 * su precio real en `detalle_ingreso_insumo`, pero ese dato no llegaba a
 * ningún lado. Como **todo el costeo de producción cuelga del costo del
 * catálogo** —la orden valoriza la receta con él, y de ahí sale el costo del
 * producto terminado y la alerta de "se vende bajo costo"—, un catálogo
 * congelado hacía que el sistema subestimara sus costos y callara justo cuando
 * debía avisar.
 */

/** Único motivo de ingreso que representa una adquisición a precio de mercado. */
const MOTIVO_COMPRA = 'Compra';

/**
 * Promedio ponderado móvil: lo que había y lo que entra, pesados por cantidad.
 *
 * Es el mismo criterio que el producto terminado ya usaba para deducir su
 * costo de las notas de ingreso, de modo que ahora los dos lados del
 * inventario responden "¿cuánto me cuesta esto?" de la misma manera.
 *
 * Se prefirió al FIFO porque el FIFO exige costear cada lote por separado y
 * arrastrarlo hasta el consumo, y las salidas de este sistema no guardan
 * costo. El promedio ponderado da un número correcto con lo que el esquema ya
 * registra.
 */
export function promedioPonderado(
  stockPrevio: number,
  costoPrevio: number,
  cantidadEntrante: number,
  costoEntrante: number,
): number {
  if (cantidadEntrante <= 0) return dosDecimales(costoPrevio);

  // Sin existencias previas no hay nada que promediar: el costo es el de la
  // compra. Es además el caso del primer reabastecimiento tras agotar el
  // insumo, donde conservar el costo viejo sería quedarse con el precio de
  // una mercadería que ya no está.
  if (stockPrevio <= 0) return dosDecimales(costoEntrante);

  const valorPrevio = stockPrevio * costoPrevio;
  const valorEntrante = cantidadEntrante * costoEntrante;
  return dosDecimales((valorPrevio + valorEntrante) / (stockPrevio + cantidadEntrante));
}

interface LineaComprada {
  idItem: number;
  cantidad: number;
  costoUnitario: number;
}

/**
 * Junta las líneas de una nota por insumo.
 *
 * Una misma nota puede traer el mismo insumo en dos almacenes distintos. El
 * costo es del insumo, no del almacén: si cada línea promediara por su cuenta,
 * la segunda lo haría contra el resultado de la primera y el orden de las
 * líneas cambiaría el costo final.
 */
export function agruparEntrantes(
  lineas: LineaComprada[],
): Map<number, { cantidad: number; costoUnitario: number }> {
  const acumulados = new Map<number, { cantidad: number; valor: number }>();

  for (const linea of lineas) {
    const previo = acumulados.get(linea.idItem) ?? { cantidad: 0, valor: 0 };
    previo.cantidad += linea.cantidad;
    previo.valor += linea.cantidad * linea.costoUnitario;
    acumulados.set(linea.idItem, previo);
  }

  return new Map(
    [...acumulados].map(([id, { cantidad, valor }]) => [
      id,
      { cantidad, costoUnitario: cantidad > 0 ? valor / cantidad : 0 },
    ]),
  );
}

/** Lo que había antes de sumar la compra, por insumo. */
export type ExistenciasPrevias = Map<number, number>;

/**
 * Fotografía del stock **antes** de aplicar el ingreso.
 *
 * Hay que tomarla por separado porque el registro de la nota incrementa las
 * existencias antes de crear el detalle —la fila de stock es clave foránea del
 * detalle—, y para promediar hace falta lo que había, no lo que quedó.
 */
export async function existenciasAntesDelIngreso(
  tx: ClientePrisma,
  lineas: LineaComprada[],
): Promise<ExistenciasPrevias> {
  const previas: ExistenciasPrevias = new Map();
  if (lineas.length === 0) return previas;

  const filas = await stockModel.existenciasDeInsumos(
    lineas.map((l) => l.idItem),
    tx,
  );
  for (const fila of filas) {
    const acumulado = previas.get(fila.id_ingrediente) ?? 0;
    previas.set(fila.id_ingrediente, acumulado + Number(fila.stock_actual));
  }
  return previas;
}

/**
 * Recalcula el costo de catálogo de los insumos comprados.
 *
 * Solo con motivo `Compra`. Un ajuste de inventario o una devolución no son
 * una adquisición a precio de mercado: mueven cantidades, no revalorizan lo
 * que ya estaba, y dejarlos entrar aquí permitiría torcer el costo con una
 * corrección de conteo.
 */
export async function actualizarCostoPorCompra(
  tx: ClientePrisma,
  motivo: string,
  lineas: LineaComprada[],
  previas: ExistenciasPrevias,
): Promise<void> {
  if (motivo !== MOTIVO_COMPRA || lineas.length === 0) return;

  const entrantes = agruparEntrantes(lineas);

  const costos = new Map(
    (await insumoModel.costosActuales([...entrantes.keys()], tx)).map((i) => [
      i.id_ingrediente,
      Number(i.costo_unitario),
    ]),
  );

  for (const [idInsumo, entrante] of entrantes) {
    if (entrante.cantidad <= 0) continue;

    const nuevo = promedioPonderado(
      previas.get(idInsumo) ?? 0,
      costos.get(idInsumo) ?? 0,
      entrante.cantidad,
      entrante.costoUnitario,
    );
    await insumoModel.fijarCosto(tx, idInsumo, nuevo);
  }
}
