import { prisma } from '../config/prisma.js';
import * as ventaModel from '../models/venta.model.js';
import { pagina, type Pagina } from '../dtos/paginacion.dto.js';
import * as clienteModel from '../models/cliente.model.js';
import type { VentaConsultada } from '../models/venta.model.js';
import type { ClientePrisma } from '../models/stock.model.js';
import type {
  ComprobanteDTO,
  DatosAnularVenta,
  AnulacionVentaDTO,
  DatosCrearVenta,
  DatosEvaluarVenta,
  DatosVentaConProduccion,
  EvaluacionVentaDTO,
  InsumoFaltanteDTO,
  LineaEvaluacionDTO,
  LineaVentaDTO,
  ProduccionRealizadaDTO,
  VentaConProduccionDTO,
  VentaDTO,
} from '../dtos/venta.dto.js';
import type { MetodoPago, TipoVenta } from '../config/dominio.js';
import {
  verificarDisponibilidad,
  descontarAsignaciones,
  asignarInsumos,
  reponerAsignaciones,
} from './stock.service.js';
import * as stockModel from '../models/stock.model.js';
import * as ordenService from './orden-produccion.service.js';
import * as pagoService from './pago.service.js';
import { modoCobro } from './configuracion.service.js';
import { requiereCobroEnLinea, type ModoCobro } from '../config/dominio.js';
import { exigirEmpleado } from './actor.service.js';
import { ErrorApp } from '../errors/error-app.js';
import { redondearCantidad } from '../utils/cantidad.js';

/**
 * CU-VEN-01 — Gestionar Venta.
 *
 * Incluye a Verificar Disponibilidad de Stock. **No** genera nota de egreso: el
 * propio detalle de la venta registra el almacén de origen y hace las veces de
 * documento. La nota de egreso existe para las salidas que no quedan
 * documentadas por otra vía —producción, merma y ajuste—, y por eso su
 * restricción `CHECK` solo admite esos tres motivos.
 */

const ACCION = 'registrar ventas';

/** Suma en centavos para no arrastrar el error del punto flotante. */
function calcularImporte(cantidad: number, precioUnitario: number): number {
  return (Math.round(precioUnitario * 100) * cantidad) / 100;
}

function nombreCompleto(usuario: { nombre: string; apellido: string }): string {
  return `${usuario.nombre} ${usuario.apellido}`;
}

function aLineas(venta: VentaConsultada): LineaVentaDTO[] {
  return venta.detalle_venta.map((d) => {
    const precioUnitario = Number(d.precio_unitario);
    return {
      idProducto: d.id_producto,
      nombre: d.producto_almacen.producto.nombre,
      almacen: d.producto_almacen.almacen.nombre,
      cantidad: d.cantidad,
      precioUnitario,
      subtotal: calcularImporte(d.cantidad, precioUnitario),
    };
  });
}

function aDTO(venta: VentaConsultada): VentaDTO {
  return {
    id: venta.id_venta,
    fecha: venta.fecha.toISOString(),
    tipoVenta: venta.tipo_venta as TipoVenta,
    metodoPago: venta.metodo_pago as MetodoPago,
    estadoPago: venta.estado_pago as VentaDTO['estadoPago'],
    total: Number(venta.total),
    cliente: venta.cliente
      ? { id: venta.cliente.id_cliente, nombreCompleto: nombreCompleto(venta.cliente.usuario) }
      : null,
    atendidoPor: {
      id: venta.empleado.id_empleado,
      nombreCompleto: nombreCompleto(venta.empleado.usuario),
    },
    items: aLineas(venta),
  };
}

async function exigirVenta(id: number): Promise<VentaConsultada> {
  const venta = await ventaModel.buscarPorId(id);
  if (!venta) throw new ErrorApp(404, 'La venta no existe');
  return venta;
}

/**
 * Agrupa las líneas repetidas del mismo producto: la clave primaria del
 * detalle es (venta, producto, almacén) y dos líneas iguales colisionarían.
 */
function consolidarItems(items: DatosCrearVenta['items']) {
  const porProducto = new Map<number, number>();
  for (const item of items) {
    porProducto.set(item.idProducto, (porProducto.get(item.idProducto) ?? 0) + item.cantidad);
  }
  return [...porProducto].map(([idProducto, cantidad]) => ({ idProducto, cantidad }));
}

export async function listar(
  idUsuario: number,
  filtro: ventaModel.FiltroVentas,
): Promise<Pagina<VentaDTO>> {
  await exigirEmpleado(idUsuario, 'consultar las ventas');
  const [ventas, total] = await ventaModel.listar(filtro);
  return pagina(ventas.map(aDTO), total, filtro);
}

export async function obtener(idUsuario: number, id: number): Promise<VentaDTO> {
  await exigirEmpleado(idUsuario, 'consultar las ventas');
  return aDTO(await exigirVenta(id));
}

/**
 * Núcleo del registro de la venta, sin abrir transacción propia.
 *
 * Lo comparten la venta normal y la venta con producción al instante: en la
 * segunda, el producto acaba de entrar al inventario dentro de esta misma
 * transacción, de modo que la verificación de existencias ya lo ve.
 */
async function registrarVentaEnTransaccion(
  tx: ClientePrisma,
  datos: {
    items: { idProducto: number; cantidad: number }[];
    tipoVenta: string;
    metodoPago: string;
    idCliente: number | null;
    idEmpleado: number;
    modo: ModoCobro;
  },
): Promise<{ idVenta: number; idPago: number }> {
  // «include» Verificar Disponibilidad de Stock — resuelve el almacén de origen.
  const asignaciones = await verificarDisponibilidad(datos.items, tx);

  const precios = await ventaModel.preciosVigentes(
    datos.items.map((i) => i.idProducto),
    tx,
  );
  const precioDe = new Map(precios.map((p) => [p.id_producto, Number(p.precio_venta)]));

  const inactivos = datos.items.filter((i) => !precioDe.has(i.idProducto));
  if (inactivos.length > 0) {
    const codigos = inactivos.map((i) => i.idProducto).join(', ');
    throw new ErrorApp(409, `Hay productos que ya no están disponibles: ${codigos}`);
  }

  const total =
    Math.round(
      datos.items.reduce(
        (suma, i) => suma + calcularImporte(i.cantidad, precioDe.get(i.idProducto)!) * 100,
        0,
      ),
    ) / 100;

  // El efectivo se cobra en el acto; el pago en línea queda pendiente hasta
  // que la pasarela confirme, y por eso la venta nace sin cobrar.
  const enLinea = requiereCobroEnLinea(datos.metodoPago as MetodoPago);

  const venta = await ventaModel.crear(tx, {
    tipoVenta: datos.tipoVenta,
    metodoPago: datos.metodoPago,
    estadoPago: enLinea ? 'Pendiente' : 'Pagado',
    total,
    idCliente: datos.idCliente,
    idEmpleado: datos.idEmpleado,
  });

  await ventaModel.crearDetalle(
    tx,
    asignaciones.map((a) => ({
      id_venta: venta.id_venta,
      id_producto: a.idProducto,
      id_almacen: a.idAlmacen,
      cantidad: a.cantidad,
      precio_unitario: precioDe.get(a.idProducto)!,
    })),
  );

  await descontarAsignaciones(asignaciones, tx);

  const idPago = await pagoService.registrarCobroEnTransaccion(tx, {
    monto: total,
    metodo: datos.metodoPago as MetodoPago,
    modo: datos.modo,
    idVenta: venta.id_venta,
  });

  return { idVenta: venta.id_venta, idPago };
}

/**
 * Abre el cobro en la pasarela, ya fuera de la transacción de la venta.
 *
 * Si la pasarela falla, la venta **no** se deshace: ya está registrada y el
 * stock descontado. Se devuelve el cobro en estado Fallido para que el
 * mostrador pueda reintentar o cobrar en efectivo, en lugar de obligar a
 * rehacer el ticket entero por una caída ajena.
 */
async function resolverCobro(
  idPago: number,
  idVenta: number,
  metodoPago: string,
): Promise<pagoService.PagoDTO | null> {
  if (!requiereCobroEnLinea(metodoPago as MetodoPago)) {
    return pagoService.deVenta(idVenta);
  }

  try {
    return await pagoService.abrirCobro(idPago, {
      descripcion: `NutriExpress - Venta ${idVenta}`,
      referenciaInterna: `VENTA-${idVenta}`,
    });
  } catch {
    return pagoService.deVenta(idVenta);
  }
}

/** Existencias disponibles de cada producto y cuánto faltaría para la venta. */
async function calcularFaltantes(
  items: { idProducto: number; cantidad: number }[],
  tx: ClientePrisma,
) {
  const existencias = await stockModel.existenciasDeProductos(
    items.map((i) => i.idProducto),
    tx,
  );

  return items.map((item) => {
    const disponible = existencias
      .filter((e) => e.id_producto === item.idProducto)
      .reduce((total, e) => total + e.stock_actual, 0);
    return { ...item, disponible, faltante: Math.max(0, item.cantidad - disponible) };
  });
}

/**
 * Registra la venta en una sola transacción.
 *
 * CU-VEN-01, excepción: si ocurre un error durante el registro, se revierte la
 * transacción completa y no se descuenta stock.
 */
export async function crear(idUsuario: number, datos: DatosCrearVenta): Promise<VentaDTO> {
  const idEmpleado = await exigirEmpleado(idUsuario, ACCION);
  const items = consolidarItems(datos.items);

  // Variación: la venta puede asociarse a un cliente registrado o no llevar ninguno.
  if (datos.idCliente) {
    const cliente = await clienteModel.buscarPorId(datos.idCliente);
    if (!cliente) throw new ErrorApp(404, 'El cliente indicado no existe');
  }

  const modo = await modoCobro();

  const { idVenta, idPago } = await prisma.$transaction((tx: ClientePrisma) =>
    registrarVentaEnTransaccion(tx, {
      items,
      tipoVenta: datos.tipoVenta,
      metodoPago: datos.metodoPago,
      idCliente: datos.idCliente ?? null,
      idEmpleado,
      modo,
    }),
  );

  const venta = aDTO(await exigirVenta(idVenta));
  venta.cobro = await resolverCobro(idPago, idVenta, datos.metodoPago);
  return venta;
}

/**
 * Evalúa qué habría que producir para poder vender, sin ejecutar nada.
 *
 * Permite que el punto de venta muestre lo que va a consumir *antes* de que el
 * vendedor confirme, en lugar de limitarse a decir "stock insuficiente".
 */
export async function evaluar(
  idUsuario: number,
  datos: DatosEvaluarVenta,
): Promise<EvaluacionVentaDTO> {
  await exigirEmpleado(idUsuario, ACCION);
  const items = consolidarItems(datos.items);

  const faltantes = await calcularFaltantes(items, prisma);
  const precios = await ventaModel.preciosVigentes(
    items.map((i) => i.idProducto),
    prisma,
  );
  const nombres = new Map(precios.map((p) => [p.id_producto, p.nombre]));

  const lineas: LineaEvaluacionDTO[] = [];

  for (const item of faltantes) {
    const nombre = nombres.get(item.idProducto) ?? `producto ${item.idProducto}`;

    if (item.faltante === 0) {
      lineas.push({
        idProducto: item.idProducto,
        nombre,
        solicitado: item.cantidad,
        enStock: item.disponible,
        faltante: 0,
        requiereProduccion: false,
        producible: true,
        cantidadAProducir: 0,
        excedente: 0,
        insumos: [],
        costoProduccion: 0,
        almacenesCompatibles: [],
        requiereElegirAlmacen: false,
        insumosFaltantes: [],
      });
      continue;
    }

    const simulacion = await ordenService.simularProduccion(item.idProducto, item.faltante);

    lineas.push({
      idProducto: item.idProducto,
      nombre,
      solicitado: item.cantidad,
      enStock: item.disponible,
      faltante: item.faltante,
      requiereProduccion: true,
      producible: simulacion.producible,
      motivo: simulacion.motivo,
      cantidadAProducir: simulacion.cantidadAProducir,
      excedente: simulacion.excedente,
      insumos: simulacion.insumos,
      costoProduccion: simulacion.costo,
      almacenesCompatibles: simulacion.almacenesCompatibles,
      requiereElegirAlmacen: simulacion.almacenesCompatibles.length > 1,
      insumosFaltantes: simulacion.insumosFaltantes,
    });
  }

  // Comprobación conjunta: cada línea se simuló contra el stock completo, de
  // modo que dos productos que comparten un insumo pueden parecer producibles
  // por separado y no serlo juntos.
  const insumosFaltantes = await faltantesDelConjunto(lineas);

  return {
    lineas,
    requiereProduccion: lineas.some((l) => l.requiereProduccion),
    puedeVenderse:
      lineas.every((l) => !l.requiereProduccion || l.producible) && insumosFaltantes.length === 0,
    insumosFaltantes,
  };
}

/** Suma lo que consumirían todas las líneas y lo contrasta una sola vez. */
async function faltantesDelConjunto(lineas: LineaEvaluacionDTO[]): Promise<InsumoFaltanteDTO[]> {
  const producibles = lineas.filter((l) => l.requiereProduccion && l.producible);
  if (producibles.length < 2) return [];

  const total = new Map<number, { nombre: string; unidad: string; cantidad: number }>();
  for (const linea of producibles) {
    for (const insumo of linea.insumos) {
      const previo = total.get(insumo.idIngrediente);
      if (previo) {
        previo.cantidad = redondearCantidad(previo.cantidad + insumo.cantidadRequerida);
      } else {
        total.set(insumo.idIngrediente, {
          nombre: insumo.nombre,
          unidad: insumo.unidad,
          cantidad: insumo.cantidadRequerida,
        });
      }
    }
  }

  const { faltantes } = await asignarInsumos(
    [...total].map(([idItem, i]) => ({ idItem, cantidad: i.cantidad })),
    prisma,
  );

  return faltantes.map((f) => ({
    nombre: total.get(f.idItem)!.nombre,
    unidad: total.get(f.idItem)!.unidad,
    requerido: f.solicitado,
    disponible: f.disponible,
  }));
}

/**
 * Registra la venta produciendo al instante lo que falte.
 *
 * Escenario del mostrador: llegan clientes, no hay producto hecho y hay que
 * elaborarlo en el momento. Todo ocurre en **una sola transacción** —órdenes de
 * producción, notas de egreso e ingreso, y la venta—, de modo que si algo falla
 * no queda ni media operación registrada.
 *
 * Solo se produce **lo que falta**, no lo que pidió el cliente: si hay 2 en
 * stock y piden 5, se elaboran 3.
 */
export async function crearConProduccion(
  idUsuario: number,
  datos: DatosVentaConProduccion,
): Promise<VentaConProduccionDTO> {
  const idEmpleado = await exigirEmpleado(idUsuario, ACCION);
  const items = consolidarItems(datos.items);

  if (datos.idCliente) {
    const cliente = await clienteModel.buscarPorId(datos.idCliente);
    if (!cliente) throw new ErrorApp(404, 'El cliente indicado no existe');
  }

  // El destino se indica por producto: una misma venta puede llevar un
  // refrigerado y un seco, y un solo almacén no serviría para ambos.
  const destinoDe = new Map(datos.destinos.map((d) => [d.idProducto, d.idAlmacen]));

  const modo = await modoCobro();

  const resultado = await prisma.$transaction(async (tx: ClientePrisma) => {
    const faltantes = await calcularFaltantes(items, tx);
    const producciones: ProduccionRealizadaDTO[] = [];

    for (const item of faltantes) {
      if (item.faltante === 0) continue;

      const produccion = await ordenService.producirAlInstante(tx, {
        idProducto: item.idProducto,
        faltante: item.faltante,
        idEmpleado,
        idAlmacenDestino: destinoDe.get(item.idProducto),
      });

      producciones.push({
        idOrden: produccion.idOrden,
        idProducto: item.idProducto,
        cantidadProducida: produccion.cantidadProducida,
        excedente: produccion.excedente,
        costoUnitario: produccion.costoUnitario,
      });
    }

    const registro = await registrarVentaEnTransaccion(tx, {
      items,
      tipoVenta: datos.tipoVenta,
      metodoPago: datos.metodoPago,
      idCliente: datos.idCliente ?? null,
      idEmpleado,
      modo,
    });

    return { ...registro, producciones };
  });

  const venta = aDTO(await exigirVenta(resultado.idVenta));
  venta.cobro = await resolverCobro(resultado.idPago, resultado.idVenta, datos.metodoPago);

  return { venta, producciones: resultado.producciones };
}

/**
 * RF-VEN-06 — genera el comprobante de la venta registrada.
 *
 * Es una proyección de la venta, no un registro nuevo: el esquema no tiene
 * tabla de comprobantes porque el comprobante no aporta información que la
 * venta no tenga ya.
 */
/**
 * Anula una venta y devuelve el stock al inventario.
 *
 * Sin esto, una venta cuyo cobro falla queda `Pendiente` para siempre y el
 * stock nunca vuelve: en el mostrador el cliente está presente, el pago con
 * tarjeta se rechaza a veces, y el vendedor no tenía forma de deshacer el
 * ticket. Los pedidos ya se resolvían solos; las ventas no.
 *
 * **Lo que esta operación no hace es devolver el dinero.** Si la venta estaba
 * cobrada, el cobro pasa a `Reembolsado` —que registra la deuda con el
 * cliente— y la devolución se entrega aparte: en efectivo desde la caja, o
 * desde el panel de la pasarela si se cobró en línea. El sistema deja
 * constancia de que corresponde; entregarla es un acto humano.
 */
export async function anular(
  idUsuario: number,
  idVenta: number,
  datos: DatosAnularVenta,
): Promise<AnulacionVentaDTO> {
  const idEmpleado = await exigirEmpleado(idUsuario, 'anular ventas');
  const venta = await exigirVenta(idVenta);

  if (venta.estado_pago === 'Anulado') {
    throw new ErrorApp(409, 'La venta ya está anulada');
  }

  const detalle = `Anulada por el empleado ${idEmpleado}. Motivo: ${datos.motivo}`;

  const requiereDevolucion = await prisma.$transaction(async (tx: ClientePrisma) => {
    // Relectura dentro de la transacción: impide que dos anulaciones
    // simultáneas repongan el stock dos veces.
    const vigente = await ventaModel.estadoDePago(idVenta, tx);
    if (vigente?.estado_pago === 'Anulado') {
      throw new ErrorApp(409, 'La venta se anuló durante la operación');
    }

    await reponerAsignaciones(
      venta.detalle_venta.map((d) => ({
        idProducto: d.id_producto,
        idAlmacen: d.id_almacen,
        cantidad: d.cantidad,
      })),
      tx,
    );

    const cobro = await pagoService.cerrarPorAnulacionDeVenta(tx, idVenta, detalle);
    await ventaModel.marcarEstadoPago(tx, idVenta, 'Anulado');

    return cobro?.requiereDevolucion ?? false;
  });

  return {
    venta: aDTO(await exigirVenta(idVenta)),
    requiereDevolucion,
    aviso: requiereDevolucion
      ? 'La venta estaba cobrada: corresponde devolverle el dinero al cliente. ' +
        'El sistema registró el reembolso, pero no lo entrega.'
      : undefined,
  };
}

/**
 * Une las líneas del mismo producto que salieron de distintos almacenes.
 *
 * `detalle_venta` tiene clave primaria (venta, producto, almacén), de modo que
 * vender 7 unidades tomando 6 de un almacén y 1 de otro genera **dos filas del
 * mismo producto**. Para el inventario esa separación es el dato: documenta de
 * dónde salió cada unidad. Para el cliente es ruido —compró 7 jugos, no 6 y 1—,
 * y verlo dos veces en su comprobante parece un error de cobro.
 *
 * El desglose no se pierde: sigue en la base y lo muestra el historial interno.
 */
function unirPorProducto(lineas: LineaVentaDTO[]): LineaVentaDTO[] {
  const porProducto = new Map<number, LineaVentaDTO>();

  for (const linea of lineas) {
    const previa = porProducto.get(linea.idProducto);
    if (!previa) {
      porProducto.set(linea.idProducto, { ...linea });
      continue;
    }
    previa.cantidad += linea.cantidad;
    previa.subtotal = Math.round((previa.subtotal + linea.subtotal) * 100) / 100;
    // El almacén deja de tener sentido al unir: la línea ya no viene de uno solo.
    previa.almacen = 'Varios almacenes';
  }

  return [...porProducto.values()];
}

export async function comprobante(idUsuario: number, id: number): Promise<ComprobanteDTO> {
  await exigirEmpleado(idUsuario, 'consultar las ventas');
  const venta = await exigirVenta(id);
  const detalle = unirPorProducto(aLineas(venta));

  return {
    numero: `V-${String(venta.id_venta).padStart(6, '0')}`,
    fecha: venta.fecha.toISOString(),
    tipoVenta: venta.tipo_venta as TipoVenta,
    metodoPago: venta.metodo_pago as MetodoPago,
    cliente: venta.cliente ? nombreCompleto(venta.cliente.usuario) : 'Consumidor final',
    atendidoPor: nombreCompleto(venta.empleado.usuario),
    detalle,
    cantidadItems: detalle.reduce((suma, l) => suma + l.cantidad, 0),
    total: Number(venta.total),
  };
}
