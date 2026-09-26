'use client';

import { Casilla } from '@/components/ui/Casilla';
import { agruparPermisos, describirPermiso } from '@/lib/roles';

/** Una casilla de la lista: el permiso, si está marcado y con qué se lo identifica. */
export interface OpcionPermiso {
  clave: number;
  codigo: string;
  marcado: boolean;
}

/**
 * Casillas de permisos, agrupadas por parte del sistema y dichas en palabras.
 *
 * Antes eran veintiún códigos en una sola lista —`ORDEN_PRODUCCION_GESTIONAR`,
 * `PEDIDO_CERRAR_AJENO`—, y armar un rol pedía saberse el informe de memoria.
 * El código sigue debajo de cada frase, para cruzarlo con el informe.
 */
export function ListaPermisos({
  opciones,
  onAlternar,
}: {
  opciones: OpcionPermiso[];
  onAlternar: (clave: number) => void;
}) {
  return (
    <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-borde p-2">
      {agruparPermisos(opciones, (o) => o.codigo).map(({ grupo, permisos }) => (
        <fieldset key={grupo}>
          <legend className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
            {grupo}
          </legend>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {permisos.map((o) => (
              <Casilla
                key={o.clave}
                marcada={o.marcado}
                onCambiar={() => onAlternar(o.clave)}
                etiqueta={
                  <span className="block">
                    <span className="block text-sm text-tinta">{describirPermiso(o.codigo)}</span>
                    <span className="block font-mono text-[10px] text-tinta-tenue">{o.codigo}</span>
                  </span>
                }
              />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
