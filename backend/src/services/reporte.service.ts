import * as reporteModel from '../models/reporte.model.js';
import { exigirEmpleado } from './actor.service.js';
import type {
  DatosEnviarReporte,
  DatosReporteVentas,
  LineaProductoReporteDTO,
  ReporteVentasDTO,
  ResumenReporteDTO,
} from '../dtos/reporte.dto.js';
import {
  fechaLegible,
  generarPdf,
  type DocumentoReporte,
} from './reporte-pdf.service.js';
import * as avisoService from './aviso.service.js';
import { limitesDelDia } from '../utils/fechas.js';
import { ErrorApp } from '../errors/error-app.js';
import { bolivianos, dosDecimales } from '../utils/dinero.js';

/**
 * RF-VEN-07 — reporte parametrizado de ventas.
 *
 * Es lo que convierte al sistema de *"registra datos"* en *"me dice cómo va el
 * negocio"*. El dueño no entra a mirar tablas: entra a saber cuánto vendió esta
 * semana y qué se vendió más.
 *
 * **No hay tabla de reportes, y es coherente:** un reporte no agrega
 * información, la presenta. Se calcula al consultar, igual que las alertas de
 * stock y el comprobante de venta.
 */



export async function ventas(
  idUsuario: number,
  filtro: DatosReporteVentas,
): Promise<ReporteVentasDTO> {
  await exigirEmpleado(idUsuario, 'consultar los reportes');

  let producto: string | null = null;
  if (filtro.idProducto) {
    const encontrado = await reporteModel.nombreDeProducto(filtro.idProducto);
    if (!encontrado) throw new ErrorApp(404, 'El producto indicado no existe');
    producto = encontrado.nombre;
  }

  const desde = limitesDelDia(filtro.desde, false);
  const hasta = limitesDelDia(filtro.hasta, true);

  const ventasDelPeriodo = await reporteModel.ventasDelPeriodo({
    desde,
    hasta,
    idProducto: filtro.idProducto,
  });

  /*
   * Los tres agrupamientos se arman en un solo recorrido. Con un filtro por
   * producto, el total sale de las líneas de ese producto y no del total de la
   * venta: si alguien compró un jugo y una ensalada, el reporte del jugo no
   * puede atribuirse la ensalada.
   */
  const porProducto = new Map<number, { nombre: string; unidades: number; importe: number }>();
  const porMetodo = new Map<string, { cantidadVentas: number; total: number }>();
  const porDia = new Map<string, { cantidadVentas: number; total: number }>();

  let unidades = 0;
  let total = 0;

  for (const venta of ventasDelPeriodo) {
    const lineas = filtro.idProducto
      ? venta.detalle_venta.filter((d) => d.id_producto === filtro.idProducto)
      : venta.detalle_venta;

    let importeDeEstaVenta = 0;

    for (const linea of lineas) {
      const importe = dosDecimales(linea.cantidad * Number(linea.precio_unitario));
      importeDeEstaVenta += importe;
      unidades += linea.cantidad;

      const acumulado = porProducto.get(linea.id_producto);
      if (acumulado) {
        acumulado.unidades += linea.cantidad;
        acumulado.importe = dosDecimales(acumulado.importe + importe);
      } else {
        porProducto.set(linea.id_producto, {
          nombre: linea.producto_almacen.producto.nombre,
          unidades: linea.cantidad,
          importe,
        });
      }
    }

    importeDeEstaVenta = dosDecimales(importeDeEstaVenta);
    total = dosDecimales(total + importeDeEstaVenta);

    const metodo = porMetodo.get(venta.metodo_pago) ?? { cantidadVentas: 0, total: 0 };
    metodo.cantidadVentas += 1;
    metodo.total = dosDecimales(metodo.total + importeDeEstaVenta);
    porMetodo.set(venta.metodo_pago, metodo);

    // Clave local, por la misma razón que los límites del día.
    const clave = `${venta.fecha.getFullYear()}-${String(venta.fecha.getMonth() + 1).padStart(2, '0')}-${String(venta.fecha.getDate()).padStart(2, '0')}`;
    const dia = porDia.get(clave) ?? { cantidadVentas: 0, total: 0 };
    dia.cantidadVentas += 1;
    dia.total = dosDecimales(dia.total + importeDeEstaVenta);
    porDia.set(clave, dia);
  }

  const lineas: LineaProductoReporteDTO[] = [...porProducto]
    .map(([idProducto, p]) => ({
      idProducto,
      nombre: p.nombre,
      unidades: p.unidades,
      importe: p.importe,
      participacion: total === 0 ? 0 : dosDecimales((p.importe / total) * 100),
    }))
    .sort((a, b) => b.importe - a.importe);

  return {
    desde: filtro.desde,
    hasta: filtro.hasta,
    producto,
    generadoEn: new Date().toISOString(),
    resumen: {
      cantidadVentas: ventasDelPeriodo.length,
      unidades,
      total,
      ticketPromedio:
        ventasDelPeriodo.length === 0 ? 0 : dosDecimales(total / ventasDelPeriodo.length),
    },
    porProducto: lineas,
    porMetodoPago: [...porMetodo]
      .map(([metodo, m]) => ({ metodo, ...m }))
      .sort((a, b) => b.total - a.total),
    porDia: [...porDia]
      .map(([dia, d]) => ({ dia, ...d }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
  };
}

/** Describe el reporte de ventas para el generador de PDF. */
function documentoDeVentas(reporte: ReporteVentasDTO): DocumentoReporte {
  return {
    titulo: 'Reporte de ventas',
    alcance: `${fechaLegible(reporte.desde)} al ${fechaLegible(reporte.hasta)} · ${
      reporte.producto ?? 'todos los productos'
    }`,
    generadoEn: reporte.generadoEn,
    cifras: [
      { etiqueta: 'Ventas', valor: String(reporte.resumen.cantidadVentas) },
      { etiqueta: 'Unidades', valor: String(reporte.resumen.unidades) },
      { etiqueta: 'Total', valor: bolivianos(reporte.resumen.total) },
      { etiqueta: 'Ticket promedio', valor: bolivianos(reporte.resumen.ticketPromedio) },
    ],
    secciones: [
      {
        titulo: 'Por producto',
        columnas: [
          { titulo: 'Producto', proporcion: 0.44 },
          { titulo: 'Unidades', proporcion: 0.15, alinear: 'right' },
          { titulo: 'Importe', proporcion: 0.23, alinear: 'right' },
          { titulo: '% del total', proporcion: 0.18, alinear: 'right' },
        ],
        filas: reporte.porProducto.map((p) => [
          p.nombre,
          String(p.unidades),
          bolivianos(p.importe),
          `${p.participacion.toFixed(1)} %`,
        ]),
        vacio: 'No hubo ventas en el período seleccionado.',
      },
      {
        titulo: 'Por método de pago',
        columnas: [
          { titulo: 'Método', proporcion: 0.5 },
          { titulo: 'Ventas', proporcion: 0.2, alinear: 'right' },
          { titulo: 'Total', proporcion: 0.3, alinear: 'right' },
        ],
        filas: reporte.porMetodoPago.map((m) => [
          m.metodo,
          String(m.cantidadVentas),
          bolivianos(m.total),
        ]),
      },
    ],
  };
}

/**
 * Genera el reporte, lo convierte en PDF y lo envía por correo (RF-VEN-07).
 *
 * A diferencia de los avisos al cliente, este **sí espera** el resultado del
 * envío: quien pidió que se mandara necesita saber si llegó. Un aviso
 * automático puede fallar en silencio; un reporte que alguien pidió a mano, no.
 */
export async function enviarVentasPorCorreo(
  idUsuario: number,
  datos: DatosEnviarReporte,
): Promise<{ enviado: boolean; motivo?: string; resumen: ResumenReporteDTO }> {
  const reporte = await ventas(idUsuario, {
    desde: datos.desde,
    hasta: datos.hasta,
    idProducto: datos.idProducto,
  });

  const pdf = await generarPdf(documentoDeVentas(reporte));

  const alcance = reporte.producto
    ? `de ${reporte.producto}, del ${reporte.desde} al ${reporte.hasta}`
    : `del ${reporte.desde} al ${reporte.hasta}`;

  const resultado = await avisoService.reporte({
    para: datos.para,
    titulo: 'Reporte de ventas',
    descripcion:
      `Reporte de ventas ${alcance}. ` +
      `${reporte.resumen.cantidadVentas} venta(s) por un total de ${bolivianos(reporte.resumen.total)}.`,
    adjunto: {
      nombre: `ventas-${reporte.desde}-a-${reporte.hasta}.pdf`,
      contenido: pdf,
      tipo: 'application/pdf',
    },
  });

  return { ...resultado, resumen: reporte.resumen };
}

/** El PDF para descargar directamente. */
export async function pdfVentas(
  idUsuario: number,
  filtro: DatosReporteVentas,
): Promise<{ pdf: Buffer; nombre: string }> {
  const reporte = await ventas(idUsuario, filtro);
  return {
    pdf: await generarPdf(documentoDeVentas(reporte)),
    nombre: `ventas-${reporte.desde}-a-${reporte.hasta}.pdf`,
  };
}
