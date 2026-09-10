import { redirect } from 'next/navigation';

/** El módulo abre en el catálogo de productos, que es su punto de partida. */
export default function PaginaProduccion() {
  redirect('/produccion/productos');
}
