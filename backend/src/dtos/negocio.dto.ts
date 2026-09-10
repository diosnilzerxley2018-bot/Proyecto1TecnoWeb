import { z } from 'zod';
import { CAMPOS_NEGOCIO } from '../config/negocio.js';

/**
 * RF-PED-03 — información del negocio.
 *
 * El esquema **se construye desde el catálogo de campos**: agregar un dato del
 * negocio no obliga a tocar este archivo. Si la validación se escribiera a
 * mano, la lista de campos y la de reglas se separarían al primer cambio.
 */

const texto = (maximo: number) => z.string().trim().min(1).max(maximo);

/** Todos los campos son opcionales: se guarda solo lo que llega. */
export const esquemaActualizarNegocio = z
  .object({
    ...Object.fromEntries(
      CAMPOS_NEGOCIO.map((c) => [c.nombre, texto(c.maximo).optional()]),
    ),
    /** Las coordenadas van juntas o no van: media coordenada no ubica nada. */
    latitud: z.number().min(-90).max(90).optional(),
    longitud: z.number().min(-180).max(180).optional(),
  })
  .refine((d) => (d.latitud === undefined) === (d.longitud === undefined), {
    message: 'Indique la latitud y la longitud juntas',
    path: ['latitud'],
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'No hay ningún dato que guardar',
  });

export type DatosActualizarNegocio = z.infer<typeof esquemaActualizarNegocio>;

/**
 * El término del buscador del encabezado.
 *
 * No reutiliza el esquema del catálogo aunque se parezca: allí omitir el
 * término significa *«todos los productos»*, y aquí un campo vacío significa
 * *«todavía no busqué nada»*. Vaciar la caja de búsqueda no es un error del
 * usuario, así que el vacío se acepta y devuelve una lista vacía.
 */
export const esquemaBusquedaSitio = z.object({
  termino: z.string().trim().max(100).default(''),
});

export interface NegocioDTO {
  nombre: string;
  lema: string;
  descripcion: string;
  horario: string;
  telefono: string;
  whatsapp: string;
  correo: string;
  direccion: string;
  cobertura: string;
  ubicacion: { latitud: number; longitud: number };
  /** Cuándo se editó por última vez. Nulo si nunca se tocó. */
  actualizadoEn: string | null;
}

/**
 * Un resultado de la búsqueda del encabezado.
 *
 * Productos e información del negocio conviven en la misma lista porque el
 * requisito pide un solo buscador; `tipo` es lo que permite a la interfaz
 * llevar cada resultado a donde corresponde.
 */
export interface ResultadoBusquedaDTO {
  tipo: 'producto' | 'informacion';
  titulo: string;
  detalle: string;
  /** Identificador del producto. Nulo en la información del negocio. */
  idProducto: number | null;
}

export interface BusquedaSitioDTO {
  termino: string;
  resultados: ResultadoBusquedaDTO[];
}
