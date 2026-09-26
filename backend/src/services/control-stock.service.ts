import * as controlStockModel from '../models/control-stock.model.js';
import * as loteModel from '../models/lote.model.js';
import { redondearCantidad } from '../utils/cantidad.js';
import type { InsumoConExistencias } from '../models/control-stock.model.js';
import type {
  AlertaStockDTO,
  ExistenciaStockDTO,
  FiltroStockDTO,
  LoteVigenteDTO,
} from '../dtos/stock.dto.js';

/**
 * CU-INV-05 — Control de Stock.
 *
 * Las alertas no se almacenan: se calculan al consultar comparando la
 * existencia consolidada contra el stock mínimo del insumo. Es lo que pide la
 * variación del caso de uso —"las alertas se actualizan automáticamente
 * después de cada movimiento"— y explica que el esquema no tenga tabla de
 * alertas: un dato derivado no se guarda.
 *
 * Solo los insumos tienen stock mínimo. Los productos terminados no lo
 * declaran en el esquema, de modo que no generan alertas de reposición.
 */

/** Redondeada a los tres decimales de la base: sumar en coma flotante deja restos. */
const sumar = (existencias: { stock: number }[]) =>
  redondearCantidad(existencias.reduce((suma, e) => suma + e.stock, 0));

/**
 * Separa lo del almacén consultado de lo del negocio entero.
 *
 * `detalle` y `total` muestran solo el almacén filtrado, que es lo que pidió
 * quien filtra; `general` suma todos. La reposición se decide contra
 * `general`: antes se comparaba lo de un solo almacén con el mínimo, que es
 * del insumo y no del almacén, y al mirar la cámara un insumo con 20 kg en el
 * depósito aparecía «por reponer».
 */
function consolidar(
  existencias: { stock_actual: unknown; almacen: { id_almacen: number; nombre: string } }[],
  idAlmacen?: number,
) {
  const todas = existencias.map((e) => ({
    idAlmacen: e.almacen.id_almacen,
    almacen: e.almacen.nombre,
    stock: Number(e.stock_actual),
  }));
  const detalle = idAlmacen ? todas.filter((e) => e.idAlmacen === idAlmacen) : todas;
  return { detalle, total: sumar(detalle), general: sumar(todas) };
}

/** Un insumo está en nivel crítico cuando alcanza o desciende bajo su mínimo. */
function alcanzoElMinimo(stockTotal: number, stockMinimo: number): boolean {
  return stockTotal <= stockMinimo;
}

function aAlertaDTO(insumo: InsumoConExistencias): AlertaStockDTO {
  const total = insumo.ingrediente_almacen.reduce(
    (suma, e) => suma + Number(e.stock_actual),
    0,
  );
  return {
    id: insumo.id_ingrediente,
    nombre: insumo.nombre,
    unidad: insumo.unidad_medida.abreviatura,
    stockTotal: total,
    stockMinimo: Number(insumo.stock_minimo),
  };
}

export async function consultar(filtro: FiltroStockDTO): Promise<ExistenciaStockDTO[]> {
  const resultado: ExistenciaStockDTO[] = [];

  if (filtro.tipo !== 'producto') {
    const insumos = await controlStockModel.existenciasDeInsumos(filtro);
    for (const insumo of insumos) {
      const { detalle, total, general } = consolidar(insumo.ingrediente_almacen, filtro.idAlmacen);
      const stockMinimo = Number(insumo.stock_minimo);
      resultado.push({
        tipo: 'insumo',
        id: insumo.id_ingrediente,
        nombre: insumo.nombre,
        unidad: insumo.unidad_medida.abreviatura,
        stockTotal: total,
        stockGeneral: general,
        stockMinimo,
        bajoMinimo: alcanzoElMinimo(general, stockMinimo),
        existencias: detalle,
      });
    }
  }

  if (filtro.tipo !== 'insumo') {
    const productos = await controlStockModel.existenciasDeProductos(filtro);
    for (const producto of productos) {
      const { detalle, total, general } = consolidar(producto.producto_almacen, filtro.idAlmacen);
      resultado.push({
        tipo: 'producto',
        id: producto.id_producto,
        nombre: producto.nombre,
        unidad: 'u',
        stockTotal: total,
        stockGeneral: general,
        stockMinimo: null,
        bajoMinimo: false,
        existencias: detalle,
      });
    }
  }

  return resultado;
}

/**
 * Insumos que alcanzaron o descendieron por debajo de su stock mínimo.
 *
 * Un insumo sin existencias en ningún almacén cuenta como stock cero y por lo
 * tanto aparece siempre que su mínimo sea mayor o igual a cero, tal como pide
 * la excepción del caso de uso.
 */
export async function alertas(idsInsumo?: number[]): Promise<AlertaStockDTO[]> {
  const insumos = await controlStockModel.insumosConExistencias(idsInsumo);
  return insumos
    .map(aAlertaDTO)
    .filter((alerta) => alcanzoElMinimo(alerta.stockTotal, alerta.stockMinimo));
}

/**
 * Lotes con existencias, del que vence antes al que vence después.
 *
 * Responde la pregunta que el modelo no podía contestar: qué hay que usar o
 * retirar primero. El parámetro `dias` acota a lo que vence dentro de ese
 * plazo; sin él devuelve todos los lotes vigentes.
 */
export async function vencimientos(dias?: number): Promise<LoteVigenteDTO[]> {
  const hasta = dias !== undefined ? new Date(Date.now() + dias * 86_400_000) : undefined;
  const filas = await loteModel.vigentes(hasta);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return filas.map((fila) => {
    const vence = fila.lote.fecha_vencimiento;
    const diasParaVencer = Math.round((vence.getTime() - hoy.getTime()) / 86_400_000);

    return {
      idLote: fila.lote.id_lote,
      codigo: fila.lote.codigo,
      insumo: fila.lote.ingrediente.nombre,
      unidad: fila.lote.ingrediente.unidad_medida.abreviatura,
      idAlmacen: fila.almacen.id_almacen,
      almacen: fila.almacen.nombre,
      stock: Number(fila.stock_actual),
      fechaVencimiento: vence.toISOString(),
      diasParaVencer,
      vencido: diasParaVencer < 0,
    };
  });
}
