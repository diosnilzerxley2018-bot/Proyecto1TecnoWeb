import * as reporteModel from '../models/reporte.model.js';
import { exigirEmpleado } from './actor.service.js';
import { fechaLegible, type DocumentoReporte } from './reporte-pdf.service.js';
import type {
  DatosReporteInventario,
  DatosReportePedidos,
  DatosReporteProduccion,
  LineaCorridaDTO,
  LineaMovimientoReporteDTO,
  LineaPedidoReporteDTO,
  ReporteInventarioDTO,
  ReportePedidosDTO,
  ReporteProduccionDTO,
  TipoItemInventario,
} from '../dtos/reporte.dto.js';
import { nombreDeArchivo, type EntregaReporte } from './reporte-entrega.service.js';
import { rangoDelPeriodo } from '../utils/fechas.js';
import { ErrorApp } from '../errors/error-app.js';
import { bolivianos, dosDecimales } from '../utils/dinero.js';
import { redondearCantidad } from '../utils/cantidad.js';

/**
 * Reportes de pedidos, producción e inventario
 * (RF-PED-10, RF-PRO-08 y RF-INV-08).
 *
 * Viven aparte del de ventas porque son otro dominio, pero comparten con él
 * las dos piezas que importan: el generador de PDF y el envío por correo.
 *
 * Como el de ventas, **ninguno se almacena**: un reporte no agrega
 * información, la presenta. Se calcula al consultar.
 */



const promedio = (valores: number[]): number | null =>
  valores.length === 0 ? null : Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);

/* ------------------------------------------------------------------ */
/* RF-PED-10 — pedidos                                                 */
/* ------------------------------------------------------------------ */

export async function pedidos(
  idUsuario: number,
  filtro: DatosReportePedidos,
): Promise<ReportePedidosDTO> {
  await exigirEmpleado(idUsuario, 'consultar los reportes');

  let repartidor: string | null = null;
  if (filtro.idRepartidor) {
    const encontrado = await reporteModel.nombreDeRepartidor(filtro.idRepartidor);
    if (!encontrado) throw new ErrorApp(404, 'El repartidor indicado no existe');
    repartidor = `${encontrado.usuario.nombre} ${encontrado.usuario.apellido}`;
  }

  const encontrados = await reporteModel.pedidosDelPeriodo({
    ...rangoDelPeriodo(filtro),
    estado: filtro.estado,
    idRepartidor: filtro.idRepartidor,
  });

  const porEstado = new Map<string, { cantidad: number; total: number }>();
  const porRepartidor = new Map<string, { entregas: number; minutos: number[] }>();
  const minutosEntregados: number[] = [];
  let total = 0;

  const lineas: LineaPedidoReporteDTO[] = encontrados.map((p) => {
    const importe = Number(p.total);
    total = dosDecimales(total + importe);

    // El tiempo de entrega no está guardado: se deduce de las dos marcas.
    const minutos = p.fecha_entrega
      ? Math.round((p.fecha_entrega.getTime() - p.fecha.getTime()) / 60_000)
      : null;
    if (minutos !== null) minutosEntregados.push(minutos);

    const e = porEstado.get(p.estado_pedido) ?? { cantidad: 0, total: 0 };
    e.cantidad += 1;
    e.total = dosDecimales(e.total + importe);
    porEstado.set(p.estado_pedido, e);

    const nombre = p.empleado
      ? `${p.empleado.usuario.nombre} ${p.empleado.usuario.apellido}`
      : null;

    if (nombre) {
      const r = porRepartidor.get(nombre) ?? { entregas: 0, minutos: [] };
      r.entregas += 1;
      if (minutos !== null) r.minutos.push(minutos);
      porRepartidor.set(nombre, r);
    }

    return {
      id: p.id_pedido,
      fecha: p.fecha.toISOString(),
      estado: p.estado_pedido,
      metodoPago: p.metodo_pago,
      total: importe,
      repartidor: nombre,
      minutosDeEntrega: minutos,
    };
  });

  return {
    desde: filtro.desde,
    hasta: filtro.hasta,
    estado: filtro.estado ?? null,
    repartidor,
    generadoEn: new Date().toISOString(),
    resumen: {
      cantidadPedidos: encontrados.length,
      entregados: porEstado.get('Entregado')?.cantidad ?? 0,
      cancelados: porEstado.get('Cancelado')?.cantidad ?? 0,
      total,
      minutosPromedio: promedio(minutosEntregados),
    },
    porEstado: [...porEstado].map(([estado, e]) => ({ estado, ...e })),
    porRepartidor: [...porRepartidor]
      .map(([nombre, r]) => ({
        repartidor: nombre,
        entregas: r.entregas,
        minutosPromedio: promedio(r.minutos),
      }))
      .sort((a, b) => b.entregas - a.entregas),
    pedidos: lineas,
  };
}

export function documentoDePedidos(reporte: ReportePedidosDTO): DocumentoReporte {
  const filtros = [
    reporte.estado ? `estado ${reporte.estado}` : null,
    reporte.repartidor ? `repartidor ${reporte.repartidor}` : null,
  ].filter(Boolean);

  return {
    titulo: 'Reporte de pedidos',
    alcance: `${fechaLegible(reporte.desde)} al ${fechaLegible(reporte.hasta)}${
      filtros.length ? ` · ${filtros.join(' · ')}` : ' · todos'
    }`,
    generadoEn: reporte.generadoEn,
    cifras: [
      { etiqueta: 'Pedidos', valor: String(reporte.resumen.cantidadPedidos) },
      { etiqueta: 'Entregados', valor: String(reporte.resumen.entregados) },
      { etiqueta: 'Total', valor: bolivianos(reporte.resumen.total) },
      {
        etiqueta: 'Entrega promedio',
        valor:
          reporte.resumen.minutosPromedio === null
            ? 'sin datos'
            : `${reporte.resumen.minutosPromedio} min`,
      },
    ],
    secciones: [
      {
        titulo: 'Por estado',
        columnas: [
          { titulo: 'Estado', proporcion: 0.5 },
          { titulo: 'Pedidos', proporcion: 0.2, alinear: 'right' },
          { titulo: 'Total', proporcion: 0.3, alinear: 'right' },
        ],
        filas: reporte.porEstado.map((e) => [e.estado, String(e.cantidad), bolivianos(e.total)]),
        vacio: 'No hubo pedidos en el período seleccionado.',
      },
      {
        titulo: 'Por repartidor',
        columnas: [
          { titulo: 'Repartidor', proporcion: 0.55 },
          { titulo: 'Entregas', proporcion: 0.2, alinear: 'right' },
          { titulo: 'Promedio', proporcion: 0.25, alinear: 'right' },
        ],
        filas: reporte.porRepartidor.map((r) => [
          r.repartidor,
          String(r.entregas),
          r.minutosPromedio === null ? 'sin datos' : `${r.minutosPromedio} min`,
        ]),
        vacio: 'Ningún pedido tuvo repartidor asignado.',
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* RF-PRO-08 — producción                                              */
/* ------------------------------------------------------------------ */

export async function produccion(
  idUsuario: number,
  filtro: DatosReporteProduccion,
): Promise<ReporteProduccionDTO> {
  await exigirEmpleado(idUsuario, 'consultar los reportes');

  let producto: string | null = null;
  if (filtro.idProducto) {
    const encontrado = await reporteModel.nombreDeProducto(filtro.idProducto);
    if (!encontrado) throw new ErrorApp(404, 'El producto indicado no existe');
    producto = encontrado.nombre;
  }

  const ordenes = await reporteModel.produccionDelPeriodo({
    ...rangoDelPeriodo(filtro),
    idProducto: filtro.idProducto,
  });

  const porProducto = new Map<string, { corridas: number; unidades: number; costo: number }>();
  const insumos = new Map<
    number,
    { insumo: string; unidad: string; cantidad: number; costo: number }
  >();

  let unidades = 0;
  let merma = 0;
  let costoTotal = 0;

  const corridas: LineaCorridaDTO[] = ordenes.map((o) => {
    /*
     * Lo obtenido, no lo planificado (H10): si se perdieron tres unidades, el
     * reporte de producción no puede declarar que salieron.
     */
    const obtenida = o.cantidad_obtenida ?? o.cantidad;

    // La receta escala por la razón entre lo producido y su rendimiento. Sirve
    // para repartir el consumo entre insumos; el costo total no sale de aquí.
    const factor = o.cantidad / o.receta.rendimiento;
    let costo = 0;

    const consumos = o.receta.detalle_receta.map((linea) => {
      const cantidad = redondearCantidad(Number(linea.cantidad_requerida) * factor);
      const parcial = dosDecimales(cantidad * Number(linea.ingrediente.costo_unitario));
      costo = dosDecimales(costo + parcial);
      return { linea, cantidad, parcial };
    });

    /*
     * El costo que la corrida dejó registrado (H5). Solo se recalcula desde la
     * receta cuando la orden es anterior a que se guardara, porque corregir el
     * precio de un insumo no debe reescribir el costo de lo ya producido.
     */
    const costoDeLaCorrida = o.costo_total !== null ? Number(o.costo_total) : costo;

    /*
     * El desglose se lleva al costo que quedó registrado.
     *
     * El total de la corrida es inmutable, pero el desglose por insumo se
     * reconstruye desde la receta y se valoriza con el costo **de hoy**, que
     * ya no es el de entonces: desde que cada compra actualiza el costo del
     * insumo, las dos cifras se separan y el reporte terminaba diciendo que
     * sus partes no sumaban su propio total.
     *
     * No hay desglose histórico guardado —la nota de egreso no lleva costo—,
     * así que se reparte el costo registrado en la misma proporción en que
     * los precios actuales reparten el recalculado. Es una aproximación: si
     * un insumo subió y otro no, el reparto la promedia entre los dos. A
     * cambio, el reporte deja de contradecirse y el total sigue siendo el que
     * la corrida dejó escrito.
     */
    const ajuste = costo > 0 ? costoDeLaCorrida / costo : 1;

    for (const { linea, cantidad, parcial } of consumos) {
      const historico = dosDecimales(parcial * ajuste);
      const id = linea.ingrediente.id_ingrediente;
      const acumulado = insumos.get(id);
      if (acumulado) {
        acumulado.cantidad = redondearCantidad(acumulado.cantidad + cantidad);
        acumulado.costo = dosDecimales(acumulado.costo + historico);
      } else {
        insumos.set(id, {
          insumo: linea.ingrediente.nombre,
          unidad: linea.ingrediente.unidad_medida.abreviatura,
          cantidad,
          costo: historico,
        });
      }
    }

    unidades += obtenida;
    merma += Math.max(0, o.cantidad - obtenida);
    costoTotal = dosDecimales(costoTotal + costoDeLaCorrida);

    const nombre = o.receta.producto.nombre;
    const p = porProducto.get(nombre) ?? { corridas: 0, unidades: 0, costo: 0 };
    p.corridas += 1;
    p.unidades += obtenida;
    p.costo = dosDecimales(p.costo + costoDeLaCorrida);
    porProducto.set(nombre, p);

    return {
      idOrden: o.id_orden_produccion,
      fecha: (o.fecha_finalizacion ?? new Date()).toISOString(),
      producto: nombre,
      receta: o.receta.nombre,
      cantidad: obtenida,
      merma: Math.max(0, o.cantidad - obtenida),
      instantanea: o.instantanea,
      costo: costoDeLaCorrida,
      costoUnitario: obtenida === 0 ? 0 : dosDecimales(costoDeLaCorrida / obtenida),
    };
  });

  return {
    desde: filtro.desde,
    hasta: filtro.hasta,
    producto,
    generadoEn: new Date().toISOString(),
    resumen: {
      corridas: ordenes.length,
      unidades,
      merma,
      costoTotal,
      costoUnitarioPromedio: unidades === 0 ? 0 : dosDecimales(costoTotal / unidades),
    },
    porProducto: [...porProducto]
      .map(([nombre, p]) => ({ producto: nombre, ...p }))
      .sort((a, b) => b.unidades - a.unidades),
    insumosConsumidos: [...insumos.values()].sort((a, b) => b.costo - a.costo),
    corridas,
  };
}

export function documentoDeProduccion(reporte: ReporteProduccionDTO): DocumentoReporte {
  return {
    titulo: 'Reporte de producción',
    alcance: `${fechaLegible(reporte.desde)} al ${fechaLegible(reporte.hasta)} · ${
      reporte.producto ?? 'todos los productos'
    }`,
    generadoEn: reporte.generadoEn,
    cifras: [
      { etiqueta: 'Corridas', valor: String(reporte.resumen.corridas) },
      { etiqueta: 'Unidades', valor: String(reporte.resumen.unidades) },
      { etiqueta: 'Merma', valor: String(reporte.resumen.merma) },
      { etiqueta: 'Costo total', valor: bolivianos(reporte.resumen.costoTotal) },
      { etiqueta: 'Costo unitario', valor: bolivianos(reporte.resumen.costoUnitarioPromedio) },
    ],
    secciones: [
      {
        titulo: 'Por producto',
        columnas: [
          { titulo: 'Producto', proporcion: 0.44 },
          { titulo: 'Corridas', proporcion: 0.16, alinear: 'right' },
          { titulo: 'Obtenidas', proporcion: 0.16, alinear: 'right' },
          { titulo: 'Costo', proporcion: 0.24, alinear: 'right' },
        ],
        filas: reporte.porProducto.map((p) => [
          p.producto,
          String(p.corridas),
          String(p.unidades),
          bolivianos(p.costo),
        ]),
        vacio: 'No se finalizó ninguna orden en el período seleccionado.',
      },
      {
        titulo: 'Insumos consumidos',
        columnas: [
          { titulo: 'Insumo', proporcion: 0.5 },
          { titulo: 'Cantidad', proporcion: 0.25, alinear: 'right' },
          { titulo: 'Costo', proporcion: 0.25, alinear: 'right' },
        ],
        filas: reporte.insumosConsumidos.map((i) => [
          i.insumo,
          `${i.cantidad} ${i.unidad}`,
          bolivianos(i.costo),
        ]),
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* RF-INV-08 — movimientos de inventario                               */
/* ------------------------------------------------------------------ */

export async function inventario(
  idUsuario: number,
  filtro: DatosReporteInventario,
): Promise<ReporteInventarioDTO> {
  await exigirEmpleado(idUsuario, 'consultar los reportes');

  let etiquetaFiltro: string | null = null;
  if (filtro.idIngrediente) {
    const encontrado = await reporteModel.nombreDeInsumo(filtro.idIngrediente);
    if (!encontrado) throw new ErrorApp(404, 'El insumo indicado no existe');
    etiquetaFiltro = `insumo ${encontrado.nombre}`;
  } else if (filtro.idProducto) {
    const encontrado = await reporteModel.nombreDeProducto(filtro.idProducto);
    if (!encontrado) throw new ErrorApp(404, 'El producto indicado no existe');
    etiquetaFiltro = `producto ${encontrado.nombre}`;
  }

  // Los ítems se nombran aparte de las fechas: esparcir el filtro entero
  // pisaría `desde`/`hasta` con las cadenas sin convertir.
  const criterio = {
    ...rangoDelPeriodo(filtro),
    idIngrediente: filtro.idIngrediente,
    idProducto: filtro.idProducto,
  };
  const [ingresos, egresos] = await Promise.all([
    reporteModel.ingresosDelPeriodo(criterio),
    reporteModel.egresosDelPeriodo(criterio),
  ]);

  /*
   * Los ítems se agrupan por tipo e identificador, no por nombre. Un insumo y
   * un producto pueden llamarse igual —la leche que se compra y la leche
   * saborizada que se vende—, y agrupados por nombre el reporte sumaba litros
   * con unidades bajo la unidad del que apareciera primero.
   */
  const porItem = new Map<
    string,
    {
      tipo: TipoItemInventario;
      id: number;
      item: string;
      unidad: string;
      entradas: number;
      salidas: number;
    }
  >();
  const movimientos: LineaMovimientoReporteDTO[] = [];
  let costoIngresado = 0;

  const registrar = (
    linea: {
      tipoItem: TipoItemInventario;
      id: number;
      item: string;
      unidad: string;
      cantidad: number;
      costo: number | null;
    },
    nota: { fecha: Date; motivo: string },
    tipo: 'Ingreso' | 'Egreso',
    referencia: string | null,
  ) => {
    const clave = `${linea.tipoItem}:${linea.id}`;
    const acumulado = porItem.get(clave) ?? {
      tipo: linea.tipoItem,
      id: linea.id,
      item: linea.item,
      unidad: linea.unidad,
      entradas: 0,
      salidas: 0,
    };
    if (tipo === 'Ingreso') {
      acumulado.entradas = redondearCantidad(acumulado.entradas + linea.cantidad);
    } else {
      acumulado.salidas = redondearCantidad(acumulado.salidas + linea.cantidad);
    }
    porItem.set(clave, acumulado);

    movimientos.push({
      fecha: nota.fecha.toISOString(),
      tipo,
      motivo: nota.motivo,
      tipoItem: linea.tipoItem,
      item: linea.item,
      unidad: linea.unidad,
      cantidad: linea.cantidad,
      costo: linea.costo,
      referencia,
    });
  };

  for (const nota of ingresos) {
    const referencia = referenciaDeIngreso(nota);

    for (const d of nota.detalle_ingreso_insumo) {
      const insumo = d.ingrediente_almacen.ingrediente;
      const cantidad = Number(d.cantidad);
      const costo = dosDecimales(cantidad * Number(d.costo_unitario));
      costoIngresado = dosDecimales(costoIngresado + costo);
      registrar(
        {
          tipoItem: 'Insumo',
          id: insumo.id_ingrediente,
          item: insumo.nombre,
          unidad: insumo.unidad_medida.abreviatura,
          cantidad,
          costo,
        },
        nota,
        'Ingreso',
        referencia,
      );
    }

    for (const d of nota.detalle_ingreso_producto) {
      const producto = d.producto_almacen.producto;
      const costo = dosDecimales(d.cantidad * Number(d.costo_unitario));
      costoIngresado = dosDecimales(costoIngresado + costo);
      registrar(
        {
          tipoItem: 'Producto',
          id: producto.id_producto,
          item: producto.nombre,
          unidad: 'u',
          cantidad: d.cantidad,
          costo,
        },
        nota,
        'Ingreso',
        referencia,
      );
    }
  }

  for (const nota of egresos) {
    const referencia = referenciaDeEgreso(nota);

    for (const d of nota.detalle_egreso_insumo) {
      const insumo = d.ingrediente_almacen.ingrediente;
      registrar(
        {
          tipoItem: 'Insumo',
          id: insumo.id_ingrediente,
          item: insumo.nombre,
          unidad: insumo.unidad_medida.abreviatura,
          cantidad: Number(d.cantidad),
          // Una salida no lleva costo propio: el esquema no lo guarda, y
          // valorizarla exigiría decidir un criterio de costeo que el informe
          // no define.
          costo: null,
        },
        nota,
        'Egreso',
        referencia,
      );
    }

    for (const d of nota.detalle_egreso_producto) {
      const producto = d.producto_almacen.producto;
      registrar(
        {
          tipoItem: 'Producto',
          id: producto.id_producto,
          item: producto.nombre,
          unidad: 'u',
          cantidad: d.cantidad,
          costo: null,
        },
        nota,
        'Egreso',
        referencia,
      );
    }
  }

  movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const items = [...porItem.values()];
  const existencias = await reporteModel.existenciasActuales(
    items.filter((i) => i.tipo === 'Insumo').map((i) => i.id),
    items.filter((i) => i.tipo === 'Producto').map((i) => i.id),
  );

  return {
    desde: filtro.desde,
    hasta: filtro.hasta,
    filtro: etiquetaFiltro,
    generadoEn: new Date().toISOString(),
    resumen: {
      ingresos: movimientos.filter((m) => m.tipo === 'Ingreso').length,
      egresos: movimientos.filter((m) => m.tipo === 'Egreso').length,
      costoIngresado,
    },
    porItem: items
      .map((i) => ({
        tipo: i.tipo,
        item: i.item,
        unidad: i.unidad,
        entradas: i.entradas,
        salidas: i.salidas,
        neto: redondearCantidad(i.entradas - i.salidas),
        existencia: redondearCantidad(
          (i.tipo === 'Insumo' ? existencias.insumos : existencias.productos).get(i.id) ?? 0,
        ),
      }))
      /*
       * Insumos primero y productos después, cada grupo por nombre. Antes se
       * ordenaba por el tamaño del neto, que mezclaba kilos con unidades: un
       * "5 u" y un "1,6 kg" no se pueden comparar.
       */
      .sort(
        (a, b) =>
          ORDEN_DE_TIPO[a.tipo] - ORDEN_DE_TIPO[b.tipo] || a.item.localeCompare(b.item, 'es'),
      ),
    movimientos,
  };
}

const ORDEN_DE_TIPO: Record<TipoItemInventario, number> = { Insumo: 0, Producto: 1 };

type NotaIngresoReporte = Awaited<ReturnType<typeof reporteModel.ingresosDelPeriodo>>[number];
type NotaEgresoReporte = Awaited<ReturnType<typeof reporteModel.egresosDelPeriodo>>[number];

/**
 * "OP-12 · Pollo a la plancha" cuando la nota la generó una orden de
 * producción. Es la relación que el reporte no mostraba: por qué salió un
 * insumo y en qué se convirtió.
 */
function referenciaDeProduccion(ordenes: NotaIngresoReporte['orden_produccion']): string | null {
  const orden = ordenes[0];
  return orden ? `OP-${orden.id_orden_produccion} · ${orden.receta.producto.nombre}` : null;
}

function referenciaDeIngreso(nota: NotaIngresoReporte): string | null {
  const produccion = referenciaDeProduccion(nota.orden_produccion);
  if (produccion) return produccion;
  const partes = [nota.proveedor, nota.numero_documento].filter((p): p is string => Boolean(p));
  return partes.length > 0 ? partes.join(' · ') : null;
}

function referenciaDeEgreso(nota: NotaEgresoReporte): string | null {
  return referenciaDeProduccion(nota.orden_produccion) ?? nota.observacion ?? null;
}

/**
 * El día en que ocurrió el movimiento, en la hora del negocio.
 *
 * `fecha` viaja como ISO en UTC: cortarle los diez primeros caracteres daría
 * el día de Greenwich, y lo registrado después de las 20:00 en Bolivia
 * aparecería con fecha del día siguiente.
 */
function diaLocal(iso: string): string {
  const fecha = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
}

/** Recorta un texto para una celda de PDF, que es de una sola línea. */
function recortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}

export function documentoDeInventario(reporte: ReporteInventarioDTO): DocumentoReporte {
  /*
   * Con un solo ítem elegido, las cifras dicen **cuánto** entró y salió, en su
   * unidad. Con todos, solo pueden contar movimientos: no se suman kilos con
   * litros ni con unidades.
   */
  const unico =
    reporte.filtro !== null && reporte.porItem.length === 1 ? reporte.porItem[0] : null;

  return {
    titulo: 'Reporte de movimientos de inventario',
    alcance: `${fechaLegible(reporte.desde)} al ${fechaLegible(reporte.hasta)} · ${
      reporte.filtro ?? 'todos los ítems'
    }`,
    generadoEn: reporte.generadoEn,
    cifras: unico
      ? [
          { etiqueta: 'Entró', valor: `${unico.entradas} ${unico.unidad}` },
          { etiqueta: 'Salió', valor: `${unico.salidas} ${unico.unidad}` },
          { etiqueta: 'Existencia hoy', valor: `${unico.existencia} ${unico.unidad}` },
          { etiqueta: 'Costo ingresado', valor: bolivianos(reporte.resumen.costoIngresado) },
        ]
      : [
          { etiqueta: 'Movimientos de entrada', valor: String(reporte.resumen.ingresos) },
          { etiqueta: 'Movimientos de salida', valor: String(reporte.resumen.egresos) },
          { etiqueta: 'Costo ingresado', valor: bolivianos(reporte.resumen.costoIngresado) },
        ],
    secciones: [
      {
        titulo: 'Movimiento por ítem',
        columnas: [
          { titulo: 'Item', proporcion: 0.3 },
          { titulo: 'Tipo', proporcion: 0.12 },
          { titulo: 'Entradas', proporcion: 0.14, alinear: 'right' },
          { titulo: 'Salidas', proporcion: 0.14, alinear: 'right' },
          { titulo: 'Neto período', proporcion: 0.15, alinear: 'right' },
          { titulo: 'Existencia hoy', proporcion: 0.15, alinear: 'right' },
        ],
        filas: reporte.porItem.map((i) => [
          recortar(i.item, 32),
          i.tipo,
          `${i.entradas} ${i.unidad}`,
          `${i.salidas} ${i.unidad}`,
          `${i.neto} ${i.unidad}`,
          `${i.existencia} ${i.unidad}`,
        ]),
        vacio: 'No hubo movimientos en el período seleccionado.',
      },
      {
        titulo: 'Detalle de movimientos',
        columnas: [
          { titulo: 'Fecha', proporcion: 0.11 },
          { titulo: 'Tipo', proporcion: 0.1 },
          { titulo: 'Motivo', proporcion: 0.12 },
          { titulo: 'Item', proporcion: 0.22 },
          { titulo: 'Cantidad', proporcion: 0.12, alinear: 'right' },
          { titulo: 'Costo', proporcion: 0.11, alinear: 'right' },
          { titulo: 'Referencia', proporcion: 0.22 },
        ],
        filas: reporte.movimientos.map((m) => [
          diaLocal(m.fecha),
          m.tipo,
          m.motivo,
          recortar(m.item, 22),
          `${m.cantidad} ${m.unidad}`,
          m.costo === null ? '—' : bolivianos(m.costo),
          recortar(m.referencia ?? '—', 24),
        ]),
        vacio: 'No hubo movimientos en el período seleccionado.',
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Entrega — el PDF y el correo de cada reporte                        */
/* ------------------------------------------------------------------ */

export const entregaDePedidos = (r: ReportePedidosDTO): EntregaReporte => ({
  documento: documentoDePedidos(r),
  archivo: nombreDeArchivo('pedidos', r.desde, r.hasta),
  descripcion:
    `Reporte de pedidos del ${r.desde} al ${r.hasta}. ` +
    `${r.resumen.cantidadPedidos} pedido(s), ${r.resumen.entregados} entregado(s), ` +
    `por un total de ${bolivianos(r.resumen.total)}.`,
});

export const entregaDeProduccion = (r: ReporteProduccionDTO): EntregaReporte => ({
  documento: documentoDeProduccion(r),
  archivo: nombreDeArchivo('produccion', r.desde, r.hasta),
  descripcion:
    `Reporte de producción del ${r.desde} al ${r.hasta}. ` +
    `${r.resumen.corridas} corrida(s) y ${r.resumen.unidades} unidad(es), ` +
    `con un costo de ${bolivianos(r.resumen.costoTotal)}.`,
});

export const entregaDeInventario = (r: ReporteInventarioDTO): EntregaReporte => ({
  documento: documentoDeInventario(r),
  archivo: nombreDeArchivo('inventario', r.desde, r.hasta),
  descripcion:
    `Reporte de movimientos del ${r.desde} al ${r.hasta}. ` +
    `${r.resumen.ingresos} movimiento(s) de entrada y ${r.resumen.egresos} de salida, ` +
    `con ${bolivianos(r.resumen.costoIngresado)} ingresados.`,
});
