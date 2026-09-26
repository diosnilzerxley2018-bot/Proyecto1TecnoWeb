import { Fragment } from 'react';
import { tramosResaltados } from '@/lib/texto';

/**
 * Un texto con lo buscado resaltado.
 *
 * Al escribir "pol", ver "**pol**lo" deja claro por qué apareció cada opción:
 * sin la marca, una lista filtrada se parece mucho a una lista cualquiera.
 *
 * Los tramos sin resaltar van como texto suelto y no envueltos en un
 * elemento: el cálculo del nombre accesible recorta los espacios de cada
 * elemento, y «Pedido <mark>#12</mark>» se leía «Pedido#12».
 */
export function TextoResaltado({ texto, busqueda }: { texto: string; busqueda: string }) {
  return (
    <>
      {tramosResaltados(texto, busqueda).map((tramo, i) =>
        tramo.resaltado ? (
          <mark key={i} className="rounded-sm bg-marca-500/20 px-px text-inherit">
            {tramo.texto}
          </mark>
        ) : (
          <Fragment key={i}>{tramo.texto}</Fragment>
        ),
      )}
    </>
  );
}
