const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/**
 * Construye la URL pública de la foto de un producto, o `null` sin foto.
 *
 * `actualizadaEn` viaja en la query como `v`: dos fotos distintas del mismo
 * producto quedan en direcciones distintas, así que el navegador puede
 * cachear la imagen para siempre (`Cache-Control: immutable` en el backend) y
 * aun así refrescarla en cuanto alguien la reemplaza.
 *
 * Es una URL pública y sin token a propósito: una etiqueta `<img>` no manda
 * la cabecera `Authorization`, igual que las teselas del mapa.
 */
export function urlImagenProducto(
  idProducto: number,
  actualizadaEn: string | null,
): string | null {
  if (!actualizadaEn) return null;
  return `${BASE}/catalogo/${idProducto}/imagen?v=${encodeURIComponent(actualizadaEn)}`;
}
