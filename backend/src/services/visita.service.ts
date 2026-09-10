import * as visitaModel from '../models/visita.model.js';
import type { ContadorVisitasDTO } from '../dtos/visita.dto.js';

/**
 * RF-WEB-03 — "Cada página debe mostrar en su pie el número de visitas
 * acumuladas."
 *
 * El contador es público: el pie aparece también en el inicio de sesión y en
 * el portal, donde todavía no hay sesión que verificar.
 */

export async function registrar(ruta?: string): Promise<ContadorVisitasDTO> {
  await visitaModel.registrar(ruta ?? null);
  return consultar();
}

export async function consultar(): Promise<ContadorVisitasDTO> {
  const [total, primera] = await Promise.all([visitaModel.contar(), visitaModel.primera()]);
  return { total, desde: primera?.fecha.toISOString() ?? null };
}
