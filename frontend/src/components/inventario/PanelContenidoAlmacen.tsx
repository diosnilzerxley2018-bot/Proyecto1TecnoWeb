'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Boxes, Package, PackageOpen, Search } from 'lucide-react';
import { PanelLateral } from '@/components/ui/Dialogo';
import { ChipsFiltro } from '@/components/ui/ChipsFiltro';
import { Insignia } from '@/components/ui/Insignia';
import { TextoResaltado } from '@/components/ui/TextoResaltado';
import { coincide } from '@/lib/texto';
import { formatearCantidad } from '@/lib/formato';
import { redondearCantidad } from '@/lib/dominio';
import { cn } from '@/lib/cn';
import type { LineaAlmacen } from '@/lib/inventario';
import type { Almacen, TipoItem } from '@/types';

type Vista = 'todo' | TipoItem;

/**
 * Qué hay guardado en un almacén: insumos y productos terminados.
 *
 * Las tarjetas de almacenes solo decían nombre y ubicación, y para saber qué
 * había dentro había que ir a Control de stock y filtrar a mano. Este panel
 * responde la pregunta desde la tarjeta misma.
 */
export function PanelContenidoAlmacen({
  almacen,
  lineas,
  onCerrar,
}: {
  almacen: Almacen | null;
  lineas: LineaAlmacen[];
  onCerrar: () => void;
}) {
  return (
    <PanelLateral
      abierto={almacen !== null}
      onCerrar={onCerrar}
      titulo={almacen?.nombre ?? ''}
      descripcion={
        almacen
          ? `${almacen.tipoConservacion} · ${almacen.ubicacionFisica ?? 'sin ubicación física registrada'}`
          : undefined
      }
      pie={
        almacen && (
          <Link
            href={`/inventario/stock?almacen=${almacen.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-marca-300 hover:underline"
          >
            Ver este almacén en Control de stock
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )
      }
    >
      {/* La clave reinicia búsqueda y pestaña al pasar de un almacén a otro. */}
      {almacen && <Contenido key={almacen.id} lineas={lineas} />}
    </PanelLateral>
  );
}

function Contenido({ lineas }: { lineas: LineaAlmacen[] }) {
  const [vista, setVista] = useState<Vista>('todo');
  const [busqueda, setBusqueda] = useState('');

  const insumos = lineas.filter((l) => l.tipo === 'insumo');
  const productos = lineas.filter((l) => l.tipo === 'producto');

  const visibles = useMemo(
    () =>
      lineas.filter((l) => (vista === 'todo' || l.tipo === vista) && coincide(l.nombre, busqueda)),
    [lineas, vista, busqueda],
  );

  if (lineas.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <PackageOpen className="size-8 text-tinta-tenue" aria-hidden />
        <p className="mt-4 text-sm font-medium text-tinta">Este almacén está vacío</p>
        <p className="mt-1.5 max-w-xs text-sm text-tinta-tenue">
          No guarda existencias de ningún insumo ni producto. Lo que se ingrese o se produzca con
          destino a él aparecerá aquí.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 space-y-3">
        <ChipsFiltro<Vista>
          idGrupo="contenido-almacen"
          valor={vista}
          onCambiar={setVista}
          opciones={[
            { valor: 'todo', etiqueta: 'Todo', cantidad: lineas.length },
            { valor: 'insumo', etiqueta: 'Insumos', cantidad: insumos.length },
            { valor: 'producto', etiqueta: 'Productos', cantidad: productos.length },
          ]}
        />
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
            aria-hidden
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en este almacén"
            aria-label="Buscar en este almacén"
            className="h-10 w-full rounded-xl border border-borde bg-superficie-alta pl-10 pr-3 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-tenue hover:border-borde-fuerte focus:border-marca-500/60"
          />
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-tinta-tenue">
          Nada coincide con «{busqueda.trim()}» en este almacén
        </p>
      ) : (
        <div className="space-y-5">
          <Grupo
            titulo="Insumos"
            lineas={visibles.filter((l) => l.tipo === 'insumo')}
            busqueda={busqueda}
          />
          <Grupo
            titulo="Productos terminados"
            lineas={visibles.filter((l) => l.tipo === 'producto')}
            busqueda={busqueda}
          />
        </div>
      )}
    </>
  );
}

function Grupo({
  titulo,
  lineas,
  busqueda,
}: {
  titulo: string;
  lineas: LineaAlmacen[];
  busqueda: string;
}) {
  if (lineas.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-tinta-tenue">
        {titulo} · {lineas.length}
      </h3>
      <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde">
        {lineas.map((linea) => (
          <Linea key={`${linea.tipo}-${linea.id}`} linea={linea} busqueda={busqueda} />
        ))}
      </ul>
    </section>
  );
}

function Linea({ linea, busqueda }: { linea: LineaAlmacen; busqueda: string }) {
  const esInsumo = linea.tipo === 'insumo';
  const enOtros = redondearCantidad(linea.stockGeneral - linea.stock);

  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-lg border',
          esInsumo
            ? 'border-info/25 bg-info/10 text-info'
            : 'border-marca-500/25 bg-marca-500/10 text-marca-400',
        )}
      >
        {esInsumo ? <Boxes className="size-3.5" aria-hidden /> : <Package className="size-3.5" aria-hidden />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-tinta">
          <TextoResaltado texto={linea.nombre} busqueda={busqueda} />
        </p>
        {/* Lo de otros almacenes también cuenta: sin esto, 2 kg aquí parecen poco
            aunque haya 20 en el depósito. */}
        {enOtros > 0 && (
          <p className="mt-0.5 text-[11px] tabular-nums text-tinta-tenue">
            {formatearCantidad(enOtros)} {linea.unidad} más en otros almacenes
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {linea.bajoMinimo && <Insignia tono="aviso">Reponer</Insignia>}
        <span
          className={cn('text-sm tabular-nums', linea.bajoMinimo ? 'text-aviso' : 'text-tinta')}
        >
          {formatearCantidad(linea.stock)} {linea.unidad}
        </span>
      </div>
    </li>
  );
}
