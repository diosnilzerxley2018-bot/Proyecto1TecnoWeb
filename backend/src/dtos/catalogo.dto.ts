import { z } from 'zod';
import type { ValorNutricionalDTO } from './comun.dto.js';

export type { ValorNutricionalDTO };

export interface ProductoDTO {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: { id: number; nombre: string };
  stockDisponible: number;
  disponible: boolean;
  valorNutricional: ValorNutricionalDTO | null;
  /**
   * Cuándo se guardó la foto vigente, o `null` sin foto.
   *
   * No es la imagen: es la marca de tiempo con la que el frontend arma
   * `/catalogo/:id/imagen?v=<esto>`, para poder cachear la foto de forma
   * agresiva y aun así refrescarla en cuanto alguien la reemplaza.
   */
  imagenActualizadaEn: string | null;
}

export interface CategoriaDTO {
  id: number;
  nombre: string;
}

/** Parámetros de búsqueda del encabezado del portal (CU-PED-01). */
export const esquemaBusqueda = z.object({
  termino: z.string().trim().min(1).max(100).optional(),
  categoria: z.coerce.number().int().positive().optional(),
});

export type ParametrosBusqueda = z.infer<typeof esquemaBusqueda>;
