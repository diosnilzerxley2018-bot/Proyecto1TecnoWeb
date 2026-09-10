'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Navegación entre páginas de un listado (hallazgo H7).
 *
 * Muestra siempre **cuántos hay en total**, no solo cuántos se ven: sin ese
 * dato, "20 ventas" en pantalla se lee como "hubo 20 ventas", que es una
 * conclusión equivocada sobre el negocio.
 *
 * Con una sola página no se dibuja nada: un control de navegación que no
 * navega a ninguna parte solo ocupa espacio.
 */
export function Paginacion({
  pagina,
  paginas,
  total,
  /** Cómo se llama lo que se está listando, en plural: «ventas», «pedidos». */
  nombre,
  onCambiar,
}: {
  pagina: number;
  paginas: number;
  total: number;
  nombre: string;
  onCambiar: (pagina: number) => void;
}) {
  if (paginas <= 1) return null;

  return (
    <nav
      aria-label={`Páginas de ${nombre}`}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-borde pt-4"
    >
      <p className="text-xs text-tinta-tenue">
        Página {pagina} de {paginas} · {total} {nombre} en total
      </p>

      <div className="flex items-center gap-1">
        <Paso
          etiqueta="Página anterior"
          deshabilitado={pagina <= 1}
          onClick={() => onCambiar(pagina - 1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Paso>
        <Paso
          etiqueta="Página siguiente"
          deshabilitado={pagina >= paginas}
          onClick={() => onCambiar(pagina + 1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Paso>
      </div>
    </nav>
  );
}

function Paso({
  etiqueta,
  deshabilitado,
  onClick,
  children,
}: {
  etiqueta: string;
  deshabilitado: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg border border-borde text-tinta-suave transition-colors hover:border-borde-fuerte hover:text-tinta disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-borde disabled:hover:text-tinta-suave"
    >
      {children}
    </button>
  );
}
