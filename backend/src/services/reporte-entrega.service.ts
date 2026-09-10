import { generarPdf, type DocumentoReporte } from './reporte-pdf.service.js';
import * as avisoService from './aviso.service.js';

/**
 * Los dos destinos de un reporte: la descarga y el correo.
 *
 * Los cuatro reportes (RF-VEN-07, RF-PED-10, RF-PRO-08, RF-INV-08) terminan
 * igual —dibujar el PDF, ponerle nombre de archivo y, si se pidió, adjuntarlo
 * a un correo—, y solo se diferencian en qué contienen. Esa parte común vive
 * aquí una sola vez.
 *
 * `reporte-pdf.service.ts` decide **cómo se ve** un documento; este archivo
 * decide **por dónde sale**. Separarlos permite que mañana un reporte salga
 * también por otra vía sin volver a tocar el dibujo.
 */

export interface EntregaReporte {
  documento: DocumentoReporte;
  /** Nombre del archivo, sin ruta. Lo ve el usuario al descargar. */
  archivo: string;
  /** Una línea que resume el reporte en el cuerpo del correo. */
  descripcion: string;
}

/** El PDF listo para responder a una descarga. */
export async function descargable(
  entrega: EntregaReporte,
): Promise<{ pdf: Buffer; nombre: string }> {
  return { pdf: await generarPdf(entrega.documento), nombre: entrega.archivo };
}

/**
 * El mismo PDF, adjunto a un correo.
 *
 * Devuelve si se envió en lugar de fallar: que el servidor de correo esté
 * caído no invalida el reporte, y quien lo pidió merece saber qué pasó.
 */
export async function porCorreo(
  para: string,
  entrega: EntregaReporte,
): Promise<{ enviado: boolean; motivo?: string }> {
  return avisoService.reporte({
    para,
    titulo: entrega.documento.titulo,
    descripcion: entrega.descripcion,
    adjunto: {
      nombre: entrega.archivo,
      contenido: await generarPdf(entrega.documento),
      tipo: 'application/pdf',
    },
  });
}

/** `pedidos-2026-09-01-a-2026-09-08.pdf` — el rango va en el nombre. */
export const nombreDeArchivo = (base: string, desde: string, hasta: string) =>
  `${base}-${desde}-a-${hasta}.pdf`;
