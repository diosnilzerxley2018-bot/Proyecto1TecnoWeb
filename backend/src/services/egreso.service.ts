import { prisma } from '../config/prisma.js';
import * as notaModel from '../models/nota-egreso.model.js';
import { pagina, type Pagina } from '../dtos/paginacion.dto.js';
import * as stockModel from '../models/stock.model.js';
import type { ClientePrisma } from '../models/stock.model.js';
import type { DatosCrearEgreso, NotaEgresoDTO } from '../dtos/movimiento.dto.js';
import type { AlertaStockDTO } from '../dtos/stock.dto.js';
import { aNotaEgresoDTO } from './movimiento.mapper.js';
import {
  consolidar,
  exigirReferenciasValidas,
  type LineaConsolidada,
} from './movimiento.comun.js';
import { verificarExistenciaEnAlmacen } from './stock.service.js';
import { alertas } from './control-stock.service.js';
import { exigirEmpleado } from './actor.service.js';
import * as insumoModel from '../models/insumo.model.js';
import * as loteService from './lote.service.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * CU-INV-04 — Gestionar Egreso.
 *
 * Incluye a Verificar Disponibilidad de Stock: ninguna salida se registra sin
 * comprobar antes que el almacén indicado tenga existencias suficientes.
 */

const ACCION = 'registrar notas de egreso';

/**
 * Respuesta del alta: la nota y las alertas resultantes.
 *
 * CU-INV-04 pide que, tras descontar, el sistema verifique si algún insumo
 * alcanzó su stock mínimo y genere la alerta correspondiente. Como las alertas
 * son un dato derivado que se calcula al consultar (CU-INV-05), se devuelven
 * junto con la nota en lugar de almacenarse.
 */
export interface ResultadoEgresoDTO {
  nota: NotaEgresoDTO;
  alertas: AlertaStockDTO[];
}

async function leerNota(id: number): Promise<NotaEgresoDTO> {
  const nota = await notaModel.buscarPorId(id);
  if (!nota) throw new ErrorApp(404, 'La nota de egreso no existe');
  return aNotaEgresoDTO(nota);
}

export async function listar(
  idUsuario: number,
  filtro: notaModel.FiltroNotas,
): Promise<Pagina<NotaEgresoDTO>> {
  await exigirEmpleado(idUsuario, 'consultar las notas de egreso');
  const [notas, total] = await notaModel.listar(filtro);
  return pagina(notas.map(aNotaEgresoDTO), total, filtro);
}

export async function obtener(idUsuario: number, id: number): Promise<NotaEgresoDTO> {
  await exigirEmpleado(idUsuario, 'consultar las notas de egreso');
  return leerNota(id);
}

/**
 * Núcleo de la operación, sin abrir transacción propia.
 *
 * CU-PRO-02 lo invoca al finalizar una orden de producción para descontar los
 * insumos consumidos. RF-PRO-07 exige que la nota de egreso, la de ingreso y
 * la actualización de ambos stocks ocurran en una sola transacción.
 */
export async function registrarEnTransaccion(
  tx: ClientePrisma,
  datos: {
    motivo: string;
    observacion: string | null;
    insumos: LineaConsolidada[];
    productos: LineaConsolidada[];
    idEmpleado: number;
  },
): Promise<number> {
  const { insumos, productos } = datos;

  await exigirReferenciasValidas(
    {
      insumos,
      productos,
      // Una merma o un ajuste debe poder vaciar del almacén un ítem ya dado de baja.
      exigirActivos: false,
      // El egreso saca lo que ya está guardado: no elige destino.
      validarConservacion: false,
    },
    tx,
  );

  // «include» Verificar Disponibilidad de Stock (CU-INV-06).
  await verificarExistenciaEnAlmacen(productos, insumos, tx);

  const nota = await notaModel.crear(tx, {
    motivo: datos.motivo,
    observacion: datos.observacion,
    idEmpleado: datos.idEmpleado,
  });

  if (insumos.length > 0) {
    await notaModel.crearDetalleInsumos(
      tx,
      insumos.map((l) => ({
        id_nota_egreso: nota.id_nota_egreso,
        id_ingrediente: l.idItem,
        id_almacen: l.idAlmacen,
        cantidad: l.cantidad,
      })),
    );
  }

  if (productos.length > 0) {
    await notaModel.crearDetalleProductos(
      tx,
      productos.map((l) => ({
        id_nota_egreso: nota.id_nota_egreso,
        id_producto: l.idItem,
        id_almacen: l.idAlmacen,
        cantidad: l.cantidad,
      })),
    );
  }

  // El descuento repite la condición de suficiencia dentro del propio UPDATE:
  // si otra operación consumió el stock entre la verificación y este punto,
  // no se afecta ninguna fila y la transacción completa se revierte.
  if (insumos.length > 0) {
    const nombres = new Map(
      (await insumoModel.existentes(insumos.map((l) => l.idItem), tx, false)).map((i) => [
        i.id_ingrediente,
        i.nombre,
      ]),
    );

    for (const linea of insumos) {
      // Consume primero el lote que vence antes (FEFO) y descuenta el total.
      await loteService.consumir(tx, {
        idIngrediente: linea.idItem,
        idAlmacen: linea.idAlmacen,
        cantidad: linea.cantidad,
        nombreInsumo: nombres.get(linea.idItem) ?? `insumo ${linea.idItem}`,
      });
    }
  }

  for (const linea of productos) {
    const aplicado = await stockModel.descontar(tx, linea.idItem, linea.idAlmacen, linea.cantidad);
    if (!aplicado) {
      throw new ErrorApp(
        409,
        `El stock del producto ${linea.idItem} cambió durante la operación. Intente nuevamente.`,
      );
    }
  }

  return nota.id_nota_egreso;
}

export async function crear(
  idUsuario: number,
  datos: DatosCrearEgreso,
): Promise<ResultadoEgresoDTO> {
  const idEmpleado = await exigirEmpleado(idUsuario, ACCION);

  const insumos = consolidar(
    datos.insumos.map((l) => ({
      idItem: l.idIngrediente,
      idAlmacen: l.idAlmacen,
      cantidad: l.cantidad,
    })),
  );
  const productos = consolidar(
    datos.productos.map((l) => ({
      idItem: l.idProducto,
      idAlmacen: l.idAlmacen,
      cantidad: l.cantidad,
    })),
  );

  const idNota = await prisma.$transaction((tx: ClientePrisma) =>
    registrarEnTransaccion(tx, {
      motivo: datos.motivo,
      observacion: datos.observacion ?? null,
      insumos,
      productos,
      idEmpleado,
    }),
  );

  return {
    nota: await leerNota(idNota),
    alertas: await alertas(insumos.map((l) => l.idItem)),
  };
}
