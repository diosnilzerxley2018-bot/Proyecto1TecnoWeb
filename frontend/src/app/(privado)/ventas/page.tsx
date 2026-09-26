import { EntradaModulo } from '@/components/EntradaModulo';

/**
 * El módulo abre en su primera pestaña permitida: el punto de venta, que es
 * su operación cotidiana, o la que corresponda a quien no vende.
 */
export default function PaginaVentas() {
  return <EntradaModulo ruta="/ventas" />;
}
