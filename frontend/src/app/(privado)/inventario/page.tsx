import { redirect } from 'next/navigation';

/** El módulo abre en el control de stock, que es la vista que más se consulta. */
export default function PaginaInventario() {
  redirect('/inventario/stock');
}
