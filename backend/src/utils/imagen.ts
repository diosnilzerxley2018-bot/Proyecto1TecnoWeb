import type { TipoImagenProducto } from '../config/dominio.js';

/**
 * Identifica el formato real de una imagen por sus primeros bytes.
 *
 * El `mimetype` que reporta el navegador en un `multipart/form-data` lo elige
 * quien envía el archivo, y no garantiza nada: basta con renombrar un `.html`
 * a `.png` para que multer lo reciba como `image/png`. El resto del sistema
 * no confía en lo que dice quien hace la petición —los permisos se verifican
 * en el servidor, los precios los pone el servidor— y esto es lo mismo
 * aplicado a un archivo.
 */
export function tipoRealDeImagen(datos: Buffer): TipoImagenProducto | null {
  if (esJPEG(datos)) return 'image/jpeg';
  if (esPNG(datos)) return 'image/png';
  if (esWEBP(datos)) return 'image/webp';
  return null;
}

function esJPEG(datos: Buffer): boolean {
  return datos.length >= 3 && datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff;
}

function esPNG(datos: Buffer): boolean {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return datos.length >= firma.length && firma.every((byte, i) => datos[i] === byte);
}

// WEBP es un contenedor RIFF: "RIFF" + tamaño (4 bytes que se ignoran) + "WEBP".
function esWEBP(datos: Buffer): boolean {
  return (
    datos.length >= 12 &&
    datos.toString('ascii', 0, 4) === 'RIFF' &&
    datos.toString('ascii', 8, 12) === 'WEBP'
  );
}
