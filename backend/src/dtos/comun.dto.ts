/** Contratos que comparten varios subsistemas. */

/** Existencias de un ítem en un almacén concreto. */
export interface ExistenciaDTO {
  idAlmacen: number;
  almacen: string;
  stock: number;
}

/** Información nutricional de un producto (RF-PRO-02). */
export interface ValorNutricionalDTO {
  calorias: number;
  proteinas: number;
  carbohidratos: number;
  grasas: number;
  fibra: number | null;
}
