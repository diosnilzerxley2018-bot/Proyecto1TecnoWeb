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
