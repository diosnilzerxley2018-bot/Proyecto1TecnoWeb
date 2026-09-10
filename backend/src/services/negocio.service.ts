import * as configModel from '../models/configuracion.model.js';
import * as catalogoService from './catalogo.service.js';
import {
  CAMPOS_NEGOCIO,
  CLAVE_LATITUD,
  CLAVE_LONGITUD,
  UBICACION_POR_OMISION,
} from '../config/negocio.js';
import type {
  BusquedaSitioDTO,
  DatosActualizarNegocio,
  NegocioDTO,
  ResultadoBusquedaDTO,
} from '../dtos/negocio.dto.js';

/**
 * RF-PED-03 — información del negocio y búsqueda del encabezado.
 *
 * *"El sistema debe permitir buscar productos e información del negocio desde
 * el encabezado de la página principal."*
 *
 * Son dos operaciones sobre lo mismo: **publicar** los datos del negocio y
 * **encontrarlos** junto con los productos. Las dos son públicas —un visitante
 * tiene que poder saber a qué hora abre el local antes de crearse una cuenta—,
 * así que este servicio nunca recibe una sesión al leer.
 */

/** Cuántos resultados devuelve el buscador del encabezado, por tipo. */
const TOPE_PRODUCTOS = 6;
const TOPE_INFORMACION = 4;

/**
 * Caché breve de la información.
 *
 * La pide cada visita a la página principal y cambia una vez cada varios
 * meses. Un minuto basta para que la corrección del administrador se vea
 * enseguida y para que el sistema no consulte la base en cada carga.
 */
const VIGENCIA_CACHE_MS = 60_000;
let cache: { valor: NegocioDTO; expira: number } | null = null;

export function invalidarCache(): void {
  cache = null;
}

/** Un número guardado como texto, o el de omisión si la fila no existe o está rota. */
function comoNumero(valor: string | undefined, omision: number): number {
  const numero = Number(valor);
  return valor !== undefined && Number.isFinite(numero) ? numero : omision;
}

export async function informacion(): Promise<NegocioDTO> {
  if (cache && Date.now() < cache.expira) return cache.valor;

  const filas = await configModel.listar();
  const valores = new Map(filas.map((f) => [f.clave, f.valor]));

  const campos = Object.fromEntries(
    CAMPOS_NEGOCIO.map((c) => [c.nombre, valores.get(c.clave) ?? c.porOmision]),
  ) as Omit<NegocioDTO, 'ubicacion' | 'actualizadoEn'>;

  // La fecha del dato del negocio editado más tarde. Las demás claves de
  // configuración —el modo de cobro, por ejemplo— no cuentan aquí.
  const clavesDelNegocio = new Set([
    ...CAMPOS_NEGOCIO.map((c) => c.clave),
    CLAVE_LATITUD,
    CLAVE_LONGITUD,
  ]);
  const fechas = filas
    .filter((f) => clavesDelNegocio.has(f.clave))
    .map((f) => f.actualizado_en.getTime());

  const valor: NegocioDTO = {
    ...campos,
    ubicacion: {
      latitud: comoNumero(valores.get(CLAVE_LATITUD), UBICACION_POR_OMISION.latitud),
      longitud: comoNumero(valores.get(CLAVE_LONGITUD), UBICACION_POR_OMISION.longitud),
    },
    actualizadoEn:
      fechas.length === 0 ? null : new Date(Math.max(...fechas)).toISOString(),
  };

  cache = { valor, expira: Date.now() + VIGENCIA_CACHE_MS };
  return valor;
}

/**
 * Guarda los datos que llegaron.
 *
 * Cada fila deja constancia de quién la cambió, igual que el modo de cobro: la
 * información pública del negocio es lo que el cliente lee antes de comprar, y
 * un cambio sin autor no se puede revisar después.
 */
export async function actualizar(
  idUsuario: number,
  datos: DatosActualizarNegocio,
): Promise<NegocioDTO> {
  for (const campo of CAMPOS_NEGOCIO) {
    const valor = datos[campo.nombre as keyof DatosActualizarNegocio];
    if (typeof valor === 'string') {
      await configModel.guardar(campo.clave, valor, idUsuario, campo.etiqueta);
    }
  }

  if (datos.latitud !== undefined && datos.longitud !== undefined) {
    await configModel.guardar(CLAVE_LATITUD, String(datos.latitud), idUsuario, 'Latitud del local');
    await configModel.guardar(
      CLAVE_LONGITUD,
      String(datos.longitud),
      idUsuario,
      'Longitud del local',
    );
  }

  invalidarCache();
  return informacion();
}

/**
 * El buscador del encabezado: productos e información, en una sola lista.
 *
 * La información se filtra en memoria y no con una consulta: son nueve campos
 * que ya están cargados, y llevarlo a SQL agregaría un `LIKE` sobre una tabla
 * de parámetros para no ganar nada.
 */
export async function buscar(termino: string): Promise<BusquedaSitioDTO> {
  const limpio = termino.trim();
  if (limpio === '') return { termino: limpio, resultados: [] };

  const [productos, negocio] = await Promise.all([
    catalogoService.buscar({ termino: limpio }),
    informacion(),
  ]);

  const buscado = normalizar(limpio);

  const deProductos: ResultadoBusquedaDTO[] = productos.slice(0, TOPE_PRODUCTOS).map((p) => ({
    tipo: 'producto',
    titulo: p.nombre,
    detalle: p.disponible ? `Bs ${p.precio.toFixed(2)}` : 'Sin existencias',
    idProducto: p.id,
  }));

  const deInformacion: ResultadoBusquedaDTO[] = CAMPOS_NEGOCIO.filter((c) => c.buscable)
    .map((c) => ({
      tipo: 'informacion' as const,
      titulo: c.etiqueta,
      detalle: negocio[c.nombre as keyof NegocioDTO] as string,
      idProducto: null,
    }))
    // Coincide por la etiqueta o por el contenido: quien escribe "horario"
    // busca el campo, y quien escribe "domingo" busca lo que dice.
    .filter(
      (r) =>
        normalizar(r.titulo).includes(buscado) || normalizar(r.detalle).includes(buscado),
    )
    .slice(0, TOPE_INFORMACION);

  return { termino: limpio, resultados: [...deProductos, ...deInformacion] };
}

/**
 * Compara sin tildes ni mayúsculas.
 *
 * Sin esto "informacion" no encontraría "Información" y el buscador parecería
 * roto en el idioma en el que está escrito el sistema.
 */
const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
