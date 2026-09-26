import { EntradaModulo } from '@/components/EntradaModulo';

/**
 * El módulo abre en su primera pestaña permitida: el catálogo de productos,
 * que es su punto de partida, o las órdenes para quien solo produce.
 */
export default function PaginaProduccion() {
  return <EntradaModulo ruta="/produccion" />;
}
