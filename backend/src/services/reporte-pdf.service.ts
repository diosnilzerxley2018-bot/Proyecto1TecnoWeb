import PDFDocument from 'pdfkit';

/**
 * Generador de reportes en PDF, común a los cuatro reportes del sistema
 * (RF-VEN-07, RF-PED-10, RF-PRO-08 y RF-INV-08).
 *
 * Se dibuja con PDFKit y no con un navegador sin cabeza: Puppeteer arrastra
 * una copia entera de Chromium —cientos de megabytes— y en la máquina virtual
 * del laboratorio, con 4 GB compartidos con PostgreSQL y Apache, no entra.
 *
 * **Cada reporte describe qué mostrar; este archivo decide cómo se ve.** Sin
 * esa separación habría cuatro copias del mismo encabezado, la misma tabla y
 * la misma numeración al pie, y corregir un margen obligaría a tocarlas todas.
 *
 * El documento se arma en memoria y se devuelve como `Buffer` porque tiene dos
 * destinos: la descarga directa y el adjunto del correo.
 */

const MARGEN = 48;
const ANCHO_UTIL = 595.28 - MARGEN * 2; // A4 en puntos, menos los márgenes.

/** Paleta sobria. Un reporte se imprime, y el color se paga en tinta. */
const TINTA = '#1c1917';
const APAGADO = '#78716c';
const LINEA = '#e7e5e4';
const MARCA = '#c2410c';

/** Altura a partir de la cual conviene saltar de página. */
const LIMITE_PAGINA = 720;

export interface ColumnaReporte {
  titulo: string;
  /** Proporción del ancho útil, de 0 a 1. Las de una tabla deben sumar 1. */
  proporcion: number;
  alinear?: 'left' | 'right';
}

export interface SeccionReporte {
  titulo: string;
  columnas: ColumnaReporte[];
  filas: string[][];
  /** Qué decir cuando no hay filas. Sin esto, la sección queda muda. */
  vacio?: string;
}

export interface DocumentoReporte {
  titulo: string;
  /** Rango y filtros, para que el PDF se explique solo sin la pantalla. */
  alcance: string;
  generadoEn: string;
  /** Las cifras del encabezado. Son la respuesta; las tablas, el detalle. */
  cifras: { etiqueta: string; valor: string }[];
  secciones: SeccionReporte[];
}

export function generarPdf(documento: DocumentoReporte): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGEN, bufferPages: true });

    const trozos: Buffer[] = [];
    doc.on('data', (t: Buffer) => trozos.push(t));
    doc.on('end', () => resolver(Buffer.concat(trozos)));
    doc.on('error', rechazar);

    encabezado(doc, documento);
    if (documento.cifras.length > 0) cifras(doc, documento.cifras);
    for (const seccion of documento.secciones) tabla(doc, seccion);
    pieDePaginas(doc);

    doc.end();
  });
}

/* ------------------------------------------------------------------ */
/* Formato compartido por los reportes                                 */
/* ------------------------------------------------------------------ */

export const fechaLegible = (iso: string) => {
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
};

/* ------------------------------------------------------------------ */
/* Piezas de dibujo                                                    */
/* ------------------------------------------------------------------ */

type Documento = PDFKit.PDFDocument;

function encabezado(doc: Documento, documento: DocumentoReporte) {
  doc.fillColor(MARCA).fontSize(16).font('Helvetica-Bold').text('NutriExpress');
  doc.fillColor(TINTA).fontSize(18).text(documento.titulo).moveDown(0.2);

  doc.fillColor(APAGADO).fontSize(9).font('Helvetica').text(documento.alcance);
  doc.text(`Generado el ${new Date(documento.generadoEn).toLocaleString('es-BO')}`);

  doc.moveDown(0.8);
  linea(doc);
  doc.moveDown(0.8);
}

/** Las cifras que responden "cómo fue el período", en una fila. */
function cifras(doc: Documento, valores: { etiqueta: string; valor: string }[]) {
  const ancho = ANCHO_UTIL / valores.length;
  const y = doc.y;

  valores.forEach((c, i) => {
    const x = MARGEN + ancho * i;
    doc
      .fillColor(APAGADO)
      .fontSize(8)
      .font('Helvetica')
      .text(c.etiqueta.toUpperCase(), x, y, { width: ancho });
    doc
      .fillColor(TINTA)
      .fontSize(13)
      .font('Helvetica-Bold')
      .text(c.valor, x, y + 12, { width: ancho });
  });

  doc.y = y + 40;
  doc.moveDown(0.5);
}

function tabla(doc: Documento, seccion: SeccionReporte) {
  if (doc.y > LIMITE_PAGINA - 60) doc.addPage();

  doc.fillColor(TINTA).fontSize(11).font('Helvetica-Bold').text(seccion.titulo);
  doc.moveDown(0.4);

  if (seccion.filas.length === 0) {
    doc
      .fillColor(APAGADO)
      .fontSize(9)
      .font('Helvetica')
      .text(seccion.vacio ?? 'Sin datos en el período seleccionado.');
    doc.moveDown(1);
    return;
  }

  filaEncabezado(doc, seccion.columnas);

  for (const valores of seccion.filas) {
    // Salto de página con el encabezado repetido: una tabla partida sin
    // encabezado obliga a volver atrás para saber qué columna es cuál.
    if (doc.y > LIMITE_PAGINA) {
      doc.addPage();
      filaEncabezado(doc, seccion.columnas);
    }
    fila(doc, seccion.columnas, valores);
  }

  doc.moveDown(1);
}

function linea(doc: Documento) {
  doc
    .strokeColor(LINEA)
    .lineWidth(0.5)
    .moveTo(MARGEN, doc.y)
    .lineTo(MARGEN + ANCHO_UTIL, doc.y)
    .stroke();
}

function filaEncabezado(doc: Documento, columnas: ColumnaReporte[]) {
  const y = doc.y;
  let x = MARGEN;

  doc.fillColor(APAGADO).fontSize(8).font('Helvetica-Bold');
  for (const c of columnas) {
    const ancho = ANCHO_UTIL * c.proporcion;
    doc.text(c.titulo.toUpperCase(), x, y, { width: ancho, align: c.alinear ?? 'left' });
    x += ancho;
  }

  doc.y = y + 14;
  linea(doc);
  doc.y += 5;
}

function fila(doc: Documento, columnas: ColumnaReporte[], valores: string[]) {
  const y = doc.y;
  let x = MARGEN;

  doc.fillColor(TINTA).fontSize(9).font('Helvetica');
  columnas.forEach((c, i) => {
    const ancho = ANCHO_UTIL * c.proporcion;
    doc.text(valores[i] ?? '', x, y, {
      width: ancho,
      align: c.alinear ?? 'left',
      ellipsis: true,
    });
    x += ancho;
  });

  doc.y = y + 16;
}

/**
 * Numeración al pie.
 *
 * Se hace al final, con `bufferPages`, porque hasta que el documento no está
 * armado no se sabe cuántas páginas tiene, y "1 de 3" necesita el 3.
 */
function pieDePaginas(doc: Documento) {
  const rango = doc.bufferedPageRange();

  for (let i = 0; i < rango.count; i += 1) {
    doc.switchToPage(rango.start + i);
    doc
      .fillColor(APAGADO)
      .fontSize(8)
      .font('Helvetica')
      .text(`NutriExpress · página ${i + 1} de ${rango.count}`, MARGEN, 800, {
        width: ANCHO_UTIL,
        align: 'center',
      });
  }
}
