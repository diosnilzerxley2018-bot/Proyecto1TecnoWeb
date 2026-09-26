import { z } from 'zod';

/** Lo que se escribió en el buscador general. */
export const esquemaBusquedaGeneral = z.object({
  q: z.string().trim().min(1, 'Escriba qué busca').max(100),
});

/**
 * De qué es cada resultado.
 *
 * El servidor no sabe a qué pantalla lleva cada uno: eso lo decide la
 * interfaz, que es la dueña de sus rutas.
 */
export type TipoResultado =
  | 'pedido'
  | 'venta'
  | 'orden'
  | 'cliente'
  | 'producto'
  | 'insumo'
  | 'almacen'
  | 'usuario';

export interface ResultadoGeneralDTO {
  tipo: TipoResultado;
  id: number;
  titulo: string;
  /** Una línea de contexto: el cliente, la categoría, el rol, la existencia… */
  detalle: string;
  /** Estado del pedido, de la venta o de la orden, tal como lo guarda la base. */
  estado: string | null;
  /** Importe de pedidos, ventas y productos. Lo formatea la interfaz. */
  monto: number | null;
  /** Cuándo ocurrió (pedidos, ventas y órdenes), en ISO 8601. */
  fecha: string | null;
  /**
   * El texto que lo distingue en su propia pantalla —el nombre de usuario, el
   * correo, el nombre del insumo—, para abrirla ya filtrada. El título no
   * sirve: dos personas pueden llamarse igual.
   */
  referencia: string | null;
}

export interface BusquedaGeneralDTO {
  termino: string;
  resultados: ResultadoGeneralDTO[];
}
