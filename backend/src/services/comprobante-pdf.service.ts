import PDFDocument from 'pdfkit';
import type { ComprobantePedidoDTO } from '../dtos/pedido.dto.js';
import { bolivianos } from '../utils/dinero.js';

/**
 * El comprobante de un pedido en PDF, con la forma de un tique de caja.
 *
 * Es el mismo comprobante que el cliente ve en pantalla (RF-VEN-06), para
 * adjuntarlo al correo y descargarlo. Se dibuja con PDFKit como los reportes
 * (`reporte-pdf.service`), pero con otra hoja: 80 mm de ancho, la de una
 * impresora de tiques, y el alto justo para lo que lleva.
 */

const ANCHO = 226.77; // 80 mm en puntos.
const MARGEN = 16;
const UTIL = ANCHO - MARGEN * 2;
const TINTA = '#1c1917';
const APAGADO = '#78716c';

/** Fecha y hora en la zona horaria de la aplicación (`config/env.ts`). */
export const fechaYHora = (iso: string) =>
  new Intl.DateTimeFormat('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

/** Las filas del bloque de datos, en el orden en que se leen. */
export function filasDelComprobante(c: ComprobantePedidoDTO): [string, string][] {
  return [
    ['Fecha', fechaYHora(c.fecha)],
    ['Pagado', c.pagadoEn ? fechaYHora(c.pagadoEn) : '—'],
    ['Cliente', c.cliente],
    ['Entrega', c.entrega],
    ['Pago', c.metodoPago],
    ...(c.referenciaPago ? ([['Ref. de pago', c.referenciaPago]] as [string, string][]) : []),
  ];
}

/**
 * Dibuja el tique y devuelve hasta dónde llegó.
 *
 * Se llama dos veces: una en una hoja larga, solo para medir, y otra en la
 * hoja definitiva, del alto justo. Calcularlo a ojo dejaba medio tique en
 * blanco o, con una dirección larga, cortaba el pie.
 */
function dibujar(doc: PDFKit.PDFDocument, c: ComprobantePedidoDTO): number {
  const filas = filasDelComprobante(c);
  const separador = () => {
    doc.moveDown(0.5);
    doc
      .moveTo(MARGEN, doc.y)
      .lineTo(ANCHO - MARGEN, doc.y)
      .dash(2, { space: 2 })
      .strokeColor(APAGADO)
      .lineWidth(0.5)
      .stroke()
      .undash();
    doc.moveDown(0.6);
  };

  /** Término a la izquierda y valor a la derecha, en el mismo renglón. */
  const fila = (termino: string, valor: string, negrita = false) => {
    const y = doc.y;
    doc.font(negrita ? 'Courier-Bold' : 'Courier').fontSize(negrita ? 10 : 7.5);
    doc.fillColor(negrita ? TINTA : APAGADO).text(termino, MARGEN, y, { width: UTIL * 0.4 });
    const altoTermino = doc.y;
    doc.fillColor(TINTA).text(valor, MARGEN + UTIL * 0.4, y, { width: UTIL * 0.6, align: 'right' });
    doc.y = Math.max(doc.y, altoTermino);
  };

  doc.fillColor(TINTA).font('Courier-Bold').fontSize(12).text('NUTRIEXPRESS', { align: 'center' });
  doc.font('Courier').fontSize(7.5).fillColor(APAGADO).text('Comida saludable', { align: 'center' });
  doc.moveDown(0.6);
  doc.fontSize(9).fillColor(TINTA).text(c.numero, { align: 'center' });
  doc.fontSize(7).fillColor(APAGADO).text('Comprobante de pago', { align: 'center' });

  separador();
  for (const [termino, valor] of filas) fila(termino, valor);

  separador();
  for (const linea of c.detalle) {
    fila(linea.nombre, bolivianos(linea.subtotal));
    doc
      .font('Courier')
      .fontSize(6.5)
      .fillColor(APAGADO)
      .text(`${linea.cantidad} x ${bolivianos(linea.precioUnitario)}`, MARGEN, doc.y);
    doc.moveDown(0.3);
  }

  separador();
  fila('Artículos', String(c.cantidadItems));
  doc.moveDown(0.3);
  fila('TOTAL', bolivianos(c.total), true);

  separador();
  doc.font('Courier').fontSize(7).fillColor(APAGADO);
  doc.text('¡Gracias por su compra!', MARGEN, doc.y, { width: UTIL, align: 'center' });
  doc.text(`Soporte: ${c.soporte}`, { width: UTIL, align: 'center' });
  return doc.y;
}

export function comprobanteEnPdf(c: ComprobantePedidoDTO): Promise<Buffer> {
  const medida = new PDFDocument({ size: [ANCHO, 2000], margin: MARGEN });
  const alto = Math.ceil(dibujar(medida, c) + MARGEN);
  medida.end();

  return new Promise((resolver, rechazar) => {
    const doc = new PDFDocument({ size: [ANCHO, alto], margin: MARGEN });
    const trozos: Buffer[] = [];
    doc.on('data', (t: Buffer) => trozos.push(t));
    doc.on('end', () => resolver(Buffer.concat(trozos)));
    doc.on('error', rechazar);

    dibujar(doc, c);
    doc.end();
  });
}
