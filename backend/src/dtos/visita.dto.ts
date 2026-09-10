import { z } from 'zod';

/** RF-WEB-03 — contador de visitas acumuladas del sitio. */

export const esquemaRegistrarVisita = z.object({
  ruta: z.string().trim().max(200).optional(),
});

export interface ContadorVisitasDTO {
  total: number;
  /** Fecha de la primera visita, o `null` si todavía no hay ninguna. */
  desde: string | null;
}
