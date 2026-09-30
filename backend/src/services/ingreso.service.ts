import { prisma } from '../config/prisma.js';
import * as notaModel from '../models/nota-ingreso.model.js';
import { pagina, type Pagina } from '../dtos/paginacion.dto.js';
import * as stockModel from '../models/stock.model.js';
import type { ClientePrisma } from '../models/stock.model.js';
import type {
  DatosCrearIngreso,
  DatosFiltroLotes,
  NotaIngresoDTO,
  PaginaLotesDTO,
} from '../dtos/movimiento.dto.js';
import { aNotaIngresoDTO, diaDe } from './movimiento.mapper.js';
import * as productoModel from '../models/producto.model.js';
import type { MotivoIngreso } from '../config/dominio.js';
import { dosDecimales } from '../utils/dinero.js';
import { redondearCantidad } from '../utils/cantidad.js';
import {
  calcularTotal,
  consolidar,
  exigirReferenciasValidas,
  type LineaConsolidada,
} from './movimiento.comun.js';
import { exigirEmpleado } from './actor.service.js';
import * as insumoModel from '../models/insumo.model.js';
import * as loteService from './lote.service.js';
import * as costeoService from './costeo.service.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * CU-INV-03 — Gestionar Ingreso.
 *
 * Toda la operación ocurre en una transacción: si falla cualquier paso, la
 * excepción del caso de uso exige revertir por completo y no tocar los stocks.
 */

const ACCION = 'registrar notas de ingreso';

async function leerNota(id: number): Promise<NotaIngresoDTO> {
  const nota = await notaModel.buscarPorId(id);
  if (!nota) throw new ErrorApp(404, 'La nota de ingreso no existe');
  return aNotaIngresoDTO(nota);
}

export async function listar(
  idUsuario: number,
  filtro: DatosFiltroLotes,
): Promise<Pagina<NotaIngresoDTO>> {
  await exigirEmpleado(idUsuario, 'consultar las notas de ingreso');
  // Buscar por nombre es buscar las notas que traen ese ítem: la vista «por
  // lote» de Inventario › Lotes.
  const porNombre = filtro.termino
    ? {
        idsInsumo: await insumoModel.idsQueCoinciden(filtro.termino),
        idsProducto: await productoModel.idsQueCoinciden(filtro.termino),
      }
    : {};
  const [notas, total] = await notaModel.listar({ ...filtro, ...porNombre });
  return pagina(notas.map(aNotaIngresoDTO), total, filtro);
}

/**
 * Inventario › Lotes, vista por ítem: cada línea de ingreso es un lote de su
 * insumo o producto, con lo que costó la unidad en esa entrada.
 *
 * El costo del insumo es un promedio de sus compras y el del producto, de sus
 * ingresos: ninguno dice a cuánto se pagó cada entrada. Esto sí, y al buscar
 * un ítem resume cuánto varió su precio de un lote a otro.
 */
export async function lotes(idUsuario: number, filtro: DatosFiltroLotes): Promise<PaginaLotesDTO> {
  await exigirEmpleado(idUsuario, 'consultar los lotes');

  const [filas, total] = await notaModel.lotes(filtro);
  const resumen = filtro.termino ? await notaModel.resumenDeLotes(filtro) : [];

  // El costo de hoy de los productos se deduce de sus ingresos, no está en una columna.
  const costoDeProducto = await productoModel.costosPromedio(
    resumen.filter((r) => r.tipo === 'producto').map((r) => r.id_item),
  );

  return {
    ...pagina(
      filas.map((f) => ({
        idNota: f.id_nota_ingreso,
        fecha: f.fecha.toISOString(),
        motivo: f.motivo as MotivoIngreso,
        proveedor: f.proveedor,
        numeroDocumento: f.numero_documento,
        tipo: f.tipo,
        id: f.id_item,
        nombre: f.nombre,
        unidad: f.unidad,
        idAlmacen: f.id_almacen,
        almacen: f.almacen,
        cantidad: f.cantidad,
        costoUnitario: f.costo_unitario,
        subtotal: dosDecimales(f.cantidad * f.costo_unitario),
        lote: f.fecha_vencimiento
          ? { codigo: f.codigo_lote, vencimiento: diaDe(f.fecha_vencimiento), queda: f.queda ?? 0 }
          : null,
      })),
      total,
      filtro,
    ),
    resumen: resumen.map((r) => ({
      tipo: r.tipo,
      id: r.id_item,
      nombre: r.nombre,
      unidad: r.unidad,
      lotes: r.lotes,
      cantidad: redondearCantidad(r.cantidad),
      costoMinimo: r.minimo,
      costoMaximo: r.maximo,
      costoUltimo: r.ultimo,
      costoActual: r.tipo === 'insumo' ? r.costo_actual : (costoDeProducto.get(r.id_item) ?? null),
    })),
  };
}

export async function obtener(idUsuario: number, id: number): Promise<NotaIngresoDTO> {
  await exigirEmpleado(idUsuario, 'consultar las notas de ingreso');
  return leerNota(id);
}


/**
 * Núcleo de la operación, sin abrir transacción propia.
 *
 * Lo comparten la ruta HTTP y CU-PRO-02: al finalizar una orden de producción
 * se genera una nota de ingreso por el producto terminado, y RF-PRO-07 exige
 * que eso ocurra en la **misma** transacción que la nota de egreso. Es la
 * relación «include» del modelo hecha llamada de función.
 */
export async function registrarEnTransaccion(
  tx: ClientePrisma,
  datos: {
    motivo: string;
    proveedor: string | null;
    numeroDocumento: string | null;
    insumos: LineaConsolidada[];
    productos: LineaConsolidada[];
    idEmpleado: number;
  },
): Promise<number> {
  const { insumos, productos } = datos;

  await exigirReferenciasValidas(
    { insumos, productos, exigirActivos: true, validarConservacion: true },
    tx,
  );

  const nota = await notaModel.crear(tx, {
    motivo: datos.motivo,
    proveedor: datos.proveedor,
    numeroDocumento: datos.numeroDocumento,
    total: calcularTotal([...insumos, ...productos]),
    idEmpleado: datos.idEmpleado,
  });

  // Cuánto había antes de sumar esta nota. Se lee ahora porque el incremento
  // que viene a continuación lo pisa, y el promedio ponderado necesita el
  // stock previo (CU-INV-03, costeo).
  const existenciasPrevias = await costeoService.existenciasAntesDelIngreso(tx, insumos);

  // Primero el stock: crea la fila que el detalle necesita como clave foránea.
  // Para los insumos, el incremento pasa por el servicio de lotes, que
  // mantiene sincronizados el total consolidado y su desglose por vencimiento.
  // El lote al que entró cada línea de un perecedero, por insumo y almacén.
  const loteDe = new Map<string, number | null>();
  if (insumos.length > 0) {
    const metadatos = new Map(
      (await insumoModel.existentes(insumos.map((l) => l.idItem), tx, false)).map((i) => [
        i.id_ingrediente,
        i,
      ]),
    );

    for (const linea of insumos) {
      const insumo = metadatos.get(linea.idItem);
      const idLote = await loteService.ingresar(tx, {
        idIngrediente: linea.idItem,
        idAlmacen: linea.idAlmacen,
        cantidad: linea.cantidad,
        controlaVencimiento: insumo?.controla_vencimiento ?? false,
        lote: linea.lote ?? null,
        nombreInsumo: insumo?.nombre ?? `insumo ${linea.idItem}`,
      });
      loteDe.set(`${linea.idItem}@${linea.idAlmacen}`, idLote);
    }
  }
  for (const linea of productos) {
    await stockModel.incrementarProducto(tx, linea.idItem, linea.idAlmacen, linea.cantidad);
  }

  if (insumos.length > 0) {
    await notaModel.crearDetalleInsumos(
      tx,
      insumos.map((l) => ({
        id_nota_ingreso: nota.id_nota_ingreso,
        id_ingrediente: l.idItem,
        id_almacen: l.idAlmacen,
        cantidad: l.cantidad,
        costo_unitario: l.costoUnitario,
        id_lote: loteDe.get(`${l.idItem}@${l.idAlmacen}`) ?? null,
      })),
    );
  }

  if (productos.length > 0) {
    await notaModel.crearDetalleProductos(
      tx,
      productos.map((l) => ({
        id_nota_ingreso: nota.id_nota_ingreso,
        id_producto: l.idItem,
        id_almacen: l.idAlmacen,
        cantidad: l.cantidad,
        costo_unitario: l.costoUnitario,
      })),
    );
  }

  /*
   * Lo que se pagó pasa a ser el costo del insumo, promediado con lo que ya
   * había. Va dentro de la misma transacción: un costo actualizado sobre una
   * compra que después se revierte describiría existencias que no entraron.
   *
   * El producto terminado no necesita el equivalente: su costo se deduce al
   * consultarlo, promediando sus notas de ingreso (`producto.costoPromedio`).
   */
  await costeoService.actualizarCostoPorCompra(tx, datos.motivo, insumos, existenciasPrevias);

  return nota.id_nota_ingreso;
}

/**
 * Registra la nota e incrementa las existencias.
 *
 * El orden dentro de la transacción no es libre: los cuatro detalles de
 * movimiento tienen clave foránea hacia la fila `(ítem, almacén)` de la tabla
 * de stock, así que esa fila debe existir antes de insertar el detalle. Por eso
 * el incremento —que la crea si falta— va primero. Es lo que permite registrar
 * la primera compra de un insumo que todavía no estaba en ese almacén.
 */
export async function crear(
  idUsuario: number,
  datos: DatosCrearIngreso,
): Promise<NotaIngresoDTO> {
  const idEmpleado = await exigirEmpleado(idUsuario, ACCION);

  const insumos = consolidar(
    datos.insumos.map((l) => ({
      idItem: l.idIngrediente,
      idAlmacen: l.idAlmacen,
      cantidad: l.cantidad,
      costoUnitario: l.costoUnitario,
      lote: l.fechaVencimiento
        ? { codigo: l.codigoLote ?? null, fechaVencimiento: new Date(l.fechaVencimiento) }
        : null,
    })),
  );
  const productos = consolidar(
    datos.productos.map((l) => ({
      idItem: l.idProducto,
      idAlmacen: l.idAlmacen,
      cantidad: l.cantidad,
      costoUnitario: l.costoUnitario,
    })),
  );

  const idNota = await prisma.$transaction((tx: ClientePrisma) =>
    registrarEnTransaccion(tx, {
      motivo: datos.motivo,
      proveedor: datos.proveedor ?? null,
      numeroDocumento: datos.numeroDocumento ?? null,
      insumos,
      productos,
      idEmpleado,
    }),
  );

  return leerNota(idNota);
}
