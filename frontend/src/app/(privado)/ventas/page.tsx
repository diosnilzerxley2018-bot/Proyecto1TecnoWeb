import { redirect } from 'next/navigation';

/** El módulo abre en el punto de venta, que es su operación cotidiana. */
export default function PaginaVentas() {
  redirect('/ventas/registro');
}
