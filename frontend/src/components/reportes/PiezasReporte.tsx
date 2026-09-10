import type { ReactNode } from 'react';

/**
 * Las dos formas en que un reporte muestra sus datos: la cifra del encabezado
 * y la tabla del detalle.
 *
 * Van juntas y en el mismo orden en los cuatro reportes: primero la respuesta,
 * después el detalle. Quien abre la pantalla quiere saber cómo fue el período,
 * no leer una tabla.
 */

export function Cifra({
  etiqueta,
  valor,
  destacada = false,
}: {
  etiqueta: string;
  valor: string;
  /** Una por reporte: la que responde la pregunta principal. */
  destacada?: boolean;
}) {
  return (
    <div className="superficie-tarjeta rounded-2xl p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
        {etiqueta}
      </p>
      <p
        className={`mt-1.5 text-xl font-semibold tabular-nums ${
          destacada ? 'text-marca-300' : 'text-tinta'
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

/** Fila de cifras del encabezado. */
export function Cifras({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

export interface ColumnaTabla<F> {
  titulo: string;
  /** Las numéricas van a la derecha, que es donde se comparan de un vistazo. */
  numerica?: boolean;
  celda: (fila: F) => ReactNode;
}

/**
 * Tabla del detalle.
 *
 * Envuelta en su propio desplazamiento horizontal: una tabla ancha no debe
 * arrastrar la página entera en un teléfono.
 */
export function TablaReporte<F>({
  titulo,
  columnas,
  filas,
  clave,
}: {
  titulo: string;
  columnas: ColumnaTabla<F>[];
  filas: F[];
  clave: (fila: F, indice: number) => string | number;
}) {
  return (
    <section className="superficie-tarjeta overflow-hidden rounded-2xl">
      <h2 className="border-b border-borde px-5 py-3.5 text-sm font-medium text-tinta">
        {titulo}
      </h2>

      {filas.length === 0 ? (
        <p className="px-5 py-4 text-sm text-tinta-tenue">
          Sin datos en el período seleccionado.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde text-[10px] uppercase tracking-wider text-tinta-tenue">
                {columnas.map((c) => (
                  <th
                    key={c.titulo}
                    className={`px-3 py-2.5 font-medium first:pl-5 last:pr-5 ${
                      c.numerica ? 'text-right' : 'text-left'
                    }`}
                  >
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((fila, i) => (
                <tr key={clave(fila, i)}>
                  {columnas.map((c) => (
                    <td
                      key={c.titulo}
                      className={`px-3 py-2.5 first:pl-5 last:pr-5 ${
                        c.numerica
                          ? 'text-right tabular-nums text-tinta'
                          : 'text-left text-tinta-suave'
                      }`}
                    >
                      {c.celda(fila)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
