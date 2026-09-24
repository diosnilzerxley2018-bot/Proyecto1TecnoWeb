import { leerSesion, borrarSesion } from './sesion';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ErrorApi extends Error {
  constructor(public readonly estado: number, mensaje: string) {
    super(mensaje);
  }
}

async function peticion<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const sesion = leerSesion();
  const cabeceras: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opciones.headers as Record<string, string> | undefined),
  };
  if (sesion?.token) cabeceras.Authorization = `Bearer ${sesion.token}`;

  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, { ...opciones, headers: cabeceras });
  } catch {
    throw new ErrorApi(0, 'No se pudo conectar con el servidor. ¿Está encendida la API?');
  }

  if (respuesta.status === 204) return undefined as T;

  const cuerpo = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    // Token vencido o inválido: se cierra la sesión local.
    if (respuesta.status === 401 && sesion) {
      borrarSesion();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    throw new ErrorApi(respuesta.status, (cuerpo as { error?: string }).error ?? 'Error inesperado');
  }
  return cuerpo as T;
}

/**
 * Descarga un archivo binario, con la sesión adjunta.
 *
 * `peticion` no sirve para esto porque siempre interpreta la respuesta como
 * JSON. Y un `<a href>` tampoco: el extremo exige la cabecera `Authorization`,
 * y una etiqueta de enlace no la manda.
 */
async function descargar(ruta: string): Promise<Blob> {
  const sesion = leerSesion();
  const cabeceras: Record<string, string> = {};
  if (sesion?.token) cabeceras.Authorization = `Bearer ${sesion.token}`;

  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, { headers: cabeceras });
  } catch {
    throw new ErrorApi(0, 'No se pudo conectar con el servidor. ¿Está encendida la API?');
  }

  if (!respuesta.ok) {
    // El error sí viene en JSON, aunque el éxito sea binario.
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new ErrorApi(
      respuesta.status,
      (cuerpo as { error?: string }).error ?? 'No se pudo generar el archivo',
    );
  }

  return respuesta.blob();
}

/**
 * Sube un archivo como `multipart/form-data`, con la sesión adjunta.
 *
 * `peticion` no sirve para esto: siempre fija `Content-Type: application/json`
 * y serializa el cuerpo con `JSON.stringify`. Un `FormData` necesita su propio
 * `Content-Type`, con el `boundary` que el navegador calcula solo — por eso
 * aquí no se fija ninguno a mano, a diferencia de `peticion`.
 */
async function subir<T>(ruta: string, datos: FormData): Promise<T> {
  const sesion = leerSesion();
  const cabeceras: Record<string, string> = {};
  if (sesion?.token) cabeceras.Authorization = `Bearer ${sesion.token}`;

  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, { method: 'POST', headers: cabeceras, body: datos });
  } catch {
    throw new ErrorApi(0, 'No se pudo conectar con el servidor. ¿Está encendida la API?');
  }

  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    if (respuesta.status === 401 && sesion) {
      borrarSesion();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    throw new ErrorApi(respuesta.status, (cuerpo as { error?: string }).error ?? 'Error inesperado');
  }
  return cuerpo as T;
}

export const api = {
  get:  <T>(ruta: string) => peticion<T>(ruta),
  descargar,
  subir,
  post: <T>(ruta: string, datos?: unknown) =>
    peticion<T>(ruta, { method: 'POST', body: datos ? JSON.stringify(datos) : undefined }),
  put:  <T>(ruta: string, datos: unknown) =>
    peticion<T>(ruta, { method: 'PUT', body: JSON.stringify(datos) }),
  patch: <T>(ruta: string, datos: unknown) =>
    peticion<T>(ruta, { method: 'PATCH', body: JSON.stringify(datos) }),
  del:  <T>(ruta: string) => peticion<T>(ruta, { method: 'DELETE' }),
};
