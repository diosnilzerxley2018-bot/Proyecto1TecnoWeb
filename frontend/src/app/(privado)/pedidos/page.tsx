import { redirect } from 'next/navigation';

/** El módulo abre en la lista de pedidos, que es lo que se consulta a diario. */
export default function PaginaPedidos() {
  redirect('/pedidos/lista');
}
