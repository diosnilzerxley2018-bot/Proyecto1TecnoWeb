'use client';

import { useEffect, useMemo, useState } from 'react';
import { PackageCheck, Snowflake, Sun, TriangleAlert } from 'lucide-react';
import { Dialogo } from '@/components/ui/Dialogo';
import { Selector } from '@/components/ui/Selector';
import { Campo } from '@/components/ui/Campo';
import { Boton } from '@/components/ui/Boton';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import type { Almacen, OrdenProduccion } from '@/types';
import { formatearCantidad } from '@/lib/formato';

/**
 * Cierre de una orden de producción (RF-PRO-07).
 *
 * Pide dos cosas, y solo cuando hacen falta:
 *
 * 1. **El almacén de destino** (hallazgo H4). El sistema lo deduce de la
 *    condición de conservación del producto; cuando hay más de un almacén
 *    compatible, la elección es del empleado. Aquí solo se ofrecen los
 *    compatibles, de modo que no es posible elegir uno que el servidor vaya a
 *    rechazar.
 * 2. **Cuántas porciones salieron de verdad** (hallazgo H10). Viene rellenado
 *    con lo planificado, que es el caso corriente: quien no tuvo merma
 *    confirma sin tocar nada. Quien sí la tuvo, corrige un número.
 */
export function DialogoFinalizar({
  orden,
  onCerrar,
  onFinalizado,
}: {
  orden: OrdenProduccion | null;
  onCerrar: () => void;
  onFinalizado: (actualizada: OrdenProduccion) => void;
}) {
  const { notificar } = useNotificaciones();

  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [idAlmacen, setIdAlmacen] = useState<number | null>(null);
  /** Como texto: un campo numérico vaciado no es cero, es «todavía nada». */
  const [obtenida, setObtenida] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orden) return;
    setError(null);
    setCargando(true);

    setObtenida(String(orden.cantidad));

    api
      .get<Almacen[]>('/almacenes')
      .then(setAlmacenes)
      .catch(() => notificar('error', 'No se pudieron cargar los almacenes'))
      .finally(() => setCargando(false));
  }, [orden, notificar]);

  const compatibles = useMemo(
    () =>
      orden
        ? almacenes.filter((a) => a.tipoConservacion === orden.producto.tipoConservacion)
        : [],
    [almacenes, orden],
  );

  // Con un solo almacén compatible no hay nada que elegir: se preselecciona.
  useEffect(() => {
    setIdAlmacen(compatibles.length === 1 ? compatibles[0].id : null);
  }, [compatibles]);

  if (!orden) return null;

  const frio = orden.producto.tipoConservacion === 'Refrigerado';

  const cantidadObtenida = Number(obtenida);
  const obtenidaValida =
    obtenida.trim() !== '' && Number.isInteger(cantidadObtenida) && cantidadObtenida >= 0;
  const merma = obtenidaValida ? orden.cantidad - cantidadObtenida : 0;
  /* Sin producto que guardar no hace falta almacén: no entra nada. */
  const necesitaAlmacen = !obtenidaValida || cantidadObtenida > 0;

  async function finalizar() {
    if (!orden) return;
    setError(null);
    setEnviando(true);
    try {
      const actualizada = await api.post<OrdenProduccion>(`/ordenes/${orden.id}/finalizar`, {
        ...(idAlmacen !== null ? { idAlmacenDestino: idAlmacen } : {}),
        cantidadObtenida: Number(obtenida),
      });
      notificar(
        'exito',
        actualizada.merma
          ? `Orden finalizada con ${actualizada.merma} de merma`
          : 'Orden finalizada: se generaron las notas de egreso e ingreso',
      );
      onFinalizado(actualizada);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo finalizar la orden');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      titulo="Registrar finalización"
      descripcion={`${orden.cantidad} × ${orden.producto.nombre}`}
      ancho="max-w-lg"
    >
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
            Se consumirán
          </h3>
          <ul className="space-y-1.5 rounded-xl border border-borde bg-white/[0.02] p-3">
            {orden.insumosRequeridos.map((insumo) => (
              <li
                key={insumo.idIngrediente}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate text-tinta-suave">{insumo.nombre}</span>
                <span className="shrink-0 tabular-nums text-tinta">
                  {formatearCantidad(insumo.cantidadRequerida)} {insumo.unidad}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
            Cuántas salieron
          </h3>
          <Campo
            etiqueta="Porciones obtenidas"
            type="number"
            min={0}
            value={obtenida}
            onChange={(e) => setObtenida(e.target.value)}
            ayuda={`Se planificaron ${orden.cantidad}. Corrija el número solo si salieron menos —o más— de las previstas.`}
          />

          {merma > 0 && (
            <p className="mt-2 flex items-start gap-2 rounded-xl border border-aviso/25 bg-aviso/10 px-3.5 py-2.5 text-xs leading-relaxed text-aviso">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Se registrarán {merma} de merma. Los insumos se consumen igual, así que el costo
                de la corrida se repartirá entre las {cantidadObtenida} que sí salieron.
              </span>
            </p>
          )}
        </section>

        {necesitaAlmacen && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
            {frio ? (
              <Snowflake className="size-3.5 text-info" aria-hidden />
            ) : (
              <Sun className="size-3.5 text-aviso" aria-hidden />
            )}
            Destino del producto terminado
          </h3>

          {cargando ? (
            <p className="text-sm text-tinta-tenue">Buscando almacenes compatibles…</p>
          ) : compatibles.length === 0 ? (
            <p className="flex items-start gap-2 rounded-xl border border-peligro/25 bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              No hay ningún almacén de conservación {orden.producto.tipoConservacion} donde recibir
              el producto. Registre uno antes de finalizar la orden.
            </p>
          ) : (
            <Selector<number>
              etiqueta="Almacén"
              valor={idAlmacen}
              onCambiar={setIdAlmacen}
              opciones={compatibles.map((a) => ({
                valor: a.id,
                etiqueta: a.nombre,
                descripcion: a.ubicacionFisica ?? a.tipoConservacion,
              }))}
              ayuda={
                compatibles.length === 1
                  ? 'Es el único almacén compatible con la conservación del producto'
                  : `${compatibles.length} almacenes admiten conservación ${orden.producto.tipoConservacion}`
              }
            />
          )}
        </section>
        )}

        <p className="rounded-xl border border-borde bg-white/[0.02] px-3.5 py-2.5 text-xs leading-relaxed text-tinta-tenue">
          {cantidadObtenida === 0 && obtenidaValida
            ? 'Al confirmar se descuentan los insumos y no ingresa ningún producto: la corrida se registra como pérdida total. El consumo queda documentado igual.'
            : 'Al confirmar se descuentan los insumos, ingresa el producto terminado y se generan la nota de egreso y la de ingreso en una sola transacción. Si algo falla, no queda nada registrado.'}
        </p>

        {error && (
          <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            cargando={enviando}
            disabled={
              !obtenidaValida || (necesitaAlmacen && (compatibles.length === 0 || idAlmacen === null))
            }
            onClick={finalizar}
            icono={<PackageCheck className="size-4" aria-hidden />}
          >
            Confirmar finalización
          </Boton>
        </div>
      </div>
    </Dialogo>
  );
}
