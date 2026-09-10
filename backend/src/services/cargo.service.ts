import * as cargoModel from '../models/cargo.model.js';
import type { CargoDTO } from '../dtos/cargo.dto.js';

export async function listar(): Promise<CargoDTO[]> {
  const cargos = await cargoModel.listar();
  return cargos.map((c) => ({
    id: c.id_cargo,
    nombre: c.nombre,
    salarioBase: Number(c.salario_base),
  }));
}
