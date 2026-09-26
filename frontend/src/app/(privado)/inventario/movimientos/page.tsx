'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  ChevronDown,
  Package,
  User,
} from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { ChipsFiltro } from '@/components/ui/ChipsFiltro';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Paginacion } from '@/components/ui/Paginacion';
import { Insignia } from '@/components/ui/Insignia';
import { Boton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/Dialogo';
import { FormularioMovimiento, type Direccion } from '@/components/inventario/FormularioMovimiento';
import type { LineaMovimiento, NotaEgreso, NotaIngreso, Pagina } from '@/types';
import { ETIQUETA_MOTIVO, TONO_MOTIVO } from '@/lib/inventario';
import { formatearBs, formatearCantidad, formatearFecha } from '@/lib/formato';
import { cn } from '@/lib/cn';

/** Nota normalizada: ingreso y egreso comparten casi toda la presentación. */
interface Movimiento {
  direccion: Direccion;
  id: number;
  fecha: string;
  motivo: string;
  registradoPor: string;
  lineas: LineaMovimiento[];
  total: number | null;
  detalle: string | null;
}

/** La respuesta que se usa cuando la vista no pide esa fuente. */
const paginaVacia = <T,>(): Pagina<T> => ({
  datos: [],
  pagina: 1,
  porPagina: 0,
  total: 0,
  paginas: 1,
});

/** CU-INV-03 Gestionar Ingreso y CU-INV-04 Gestionar Egreso. */
/**
 * Qué se lee debajo de un ingreso.
 *
 * Una orden de producción firma su nota de ingreso con «OP-17» y la de egreso
 * con «Orden de producción 17»: en la lista, las dos mitades de la misma
 * orden parecían cosas distintas. Se leen igual; el dato guardado no cambia.
 */
function detalleDeIngreso(nota: {
  motivo: string;
  proveedor: string | null;
  numeroDocumento: string | null;
}): string | null {
  const orden = /^OP-(\d+)$/.exec(nota.numeroDocumento ?? '');
  if (nota.motivo === 'Produccion' && orden) return `Orden de producción ${orden[1]}`;
  return [nota.proveedor, nota.numeroDocumento].filter(Boolean).join(' · ') || null;
}

export default function PaginaMovimientos() {
  const { tienePermiso } = useAuth();
  const { notificar } = useNotificaciones();

  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<'todos' | Direccion>('todos');
  const [registrando, setRegistrando] = useState<Direccion | null>(null);

  /*
   * Los dos listados vienen por páginas (H7).
   *
   * En la vista combinada las dos avanzan **en paralelo**: la página N trae la
   * N de ingresos y la N de egresos, y se ordenan entre sí. El orden es exacto
   * dentro de cada página y aproximado entre páginas, pero **no se pierde
   * ninguna nota**, que es lo que importa en un registro de inventario. La
   * vista estrictamente cronológica de todo el período es el reporte de
   * movimientos (RF-INV-08).
   */
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [totales, setTotales] = useState({ ingresos: 0, egresos: 0 });

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const consulta = `?pagina=${pagina}`;
      const [respuestaIngresos, respuestaEgresos] = await Promise.all([
        vista === 'egreso'
          ? Promise.resolve(paginaVacia<NotaIngreso>())
          : api.get<Pagina<NotaIngreso>>(`/ingresos${consulta}`),
        vista === 'ingreso'
          ? Promise.resolve(paginaVacia<NotaEgreso>())
          : api.get<Pagina<NotaEgreso>>(`/egresos${consulta}`),
      ]);

      const ingresos = respuestaIngresos.datos;
      const egresos = respuestaEgresos.datos;

      const normalizados: Movimiento[] = [
        ...ingresos.map<Movimiento>((n) => ({
          direccion: 'ingreso',
          id: n.id,
          fecha: n.fecha,
          motivo: n.motivo,
          registradoPor: n.registradoPor.nombreCompleto,
          lineas: n.lineas,
          total: n.total,
          detalle: detalleDeIngreso(n),
        })),
        ...egresos.map<Movimiento>((n) => ({
          direccion: 'egreso',
          id: n.id,
          fecha: n.fecha,
          motivo: n.motivo,
          registradoPor: n.registradoPor.nombreCompleto,
          lineas: n.lineas,
          total: null,
          detalle: n.observacion,
        })),
      ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

      setMovimientos(normalizados);
      setPaginas(Math.max(respuestaIngresos.paginas, respuestaEgresos.paginas));
      setTotales({ ingresos: respuestaIngresos.total, egresos: respuestaEgresos.total });
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar los movimientos');
    } finally {
      setCargando(false);
    }
  }, [notificar, pagina, vista]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** El total de la vista actual, para el pie del listado. */
  const totalVisible =
    vista === 'ingreso'
      ? totales.ingresos
      : vista === 'egreso'
        ? totales.egresos
        : totales.ingresos + totales.egresos;

  /** Cambiar de vista vuelve a la primera página: la quinta puede no existir. */
  function cambiarVista(nueva: 'todos' | Direccion) {
    setVista(nueva);
    setPagina(1);
  }

  const puedeIngresar = tienePermiso('INGRESO_REGISTRAR');
  const puedeEgresar = tienePermiso('EGRESO_REGISTRAR');

  return (
    <>
      <EncabezadoPagina
        titulo="Movimientos"
        descripcion="Notas de ingreso y egreso que documentan cada entrada y salida del inventario"
        acciones={
          <>
            {puedeIngresar && (
              <Boton
                variante="contorno"
                onClick={() => setRegistrando('ingreso')}
                icono={<ArrowDownToLine className="size-4" aria-hidden />}
              >
                Ingreso
              </Boton>
            )}
            {puedeEgresar && (
              <Boton
                variante="primario"
                onClick={() => setRegistrando('egreso')}
                icono={<ArrowUpFromLine className="size-4" aria-hidden />}
              >
                Egreso
              </Boton>
            )}
          </>
        }
      />

      <div className="mb-5">
        <ChipsFiltro<'todos' | Direccion>
          idGrupo="filtro-movimientos"
          valor={vista}
          onCambiar={cambiarVista}
          opciones={[
            {
              valor: 'todos',
              etiqueta: 'Todos',
              cantidad: totales.ingresos + totales.egresos,
            },
            { valor: 'ingreso', etiqueta: 'Ingresos', cantidad: totales.ingresos },
            { valor: 'egreso', etiqueta: 'Egresos', cantidad: totales.egresos },
          ]}
        />
      </div>

      {cargando ? (
        <EsqueletoFilas filas={5} alto="h-24" />
      ) : movimientos.length === 0 ? (
        <EstadoVacio
          icono={<ArrowLeftRight className="size-6" aria-hidden />}
          titulo="Sin movimientos registrados"
          descripcion="Las notas de ingreso documentan lo que entra al almacén; las de egreso, las salidas por producción, merma o ajuste."
          accion={
            puedeIngresar && (
              <Boton variante="primario" onClick={() => setRegistrando('ingreso')}>
                Registrar el primer ingreso
              </Boton>
            )
          }
        />
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence mode="popLayout">
            {movimientos.map((movimiento, indice) => (
              <TarjetaMovimiento
                key={`${movimiento.direccion}-${movimiento.id}`}
                movimiento={movimiento}
                indice={indice}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Paginacion
        pagina={pagina}
        paginas={paginas}
        total={totalVisible}
        nombre="movimientos"
        onCambiar={setPagina}
      />

      <Dialogo
        abierto={registrando !== null}
        onCerrar={() => setRegistrando(null)}
        ancho="max-w-2xl"
        titulo={registrando === 'ingreso' ? 'Nueva nota de ingreso' : 'Nueva nota de egreso'}
        descripcion={
          registrando === 'ingreso'
            ? 'Todo lo que entra al almacén, con su costo y documento de respaldo'
            : 'Salidas por producción, merma o ajuste de inventario'
        }
      >
        {registrando && (
          <FormularioMovimiento
            direccion={registrando}
            onCancelar={() => setRegistrando(null)}
            onListo={() => {
              setRegistrando(null);
              void cargar();
            }}
          />
        )}
      </Dialogo>
    </>
  );
}

function TarjetaMovimiento({
  movimiento,
  indice,
}: {
  movimiento: Movimiento;
  indice: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const entra = movimiento.direccion === 'ingreso';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.28, delay: Math.min(indice * 0.035, 0.3), ease: 'easeOut' }}
      className="superficie-tarjeta overflow-hidden rounded-2xl"
    >
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.025]"
      >
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl border',
            entra
              ? 'border-marca-500/25 bg-marca-500/10 text-marca-400'
              : 'border-peligro/25 bg-peligro/10 text-peligro',
          )}
        >
          {entra ? (
            <ArrowDownToLine className="size-5" aria-hidden />
          ) : (
            <ArrowUpFromLine className="size-5" aria-hidden />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-tinta-tenue">
              {entra ? 'ING' : 'EGR'}-{String(movimiento.id).padStart(4, '0')}
            </span>
            <Insignia tono={TONO_MOTIVO[movimiento.motivo] ?? 'neutro'}>
              {ETIQUETA_MOTIVO[movimiento.motivo] ?? movimiento.motivo}
            </Insignia>
          </div>
          <p className="mt-1 truncate text-sm text-tinta-suave">
            {movimiento.detalle ?? `${movimiento.lineas.length} ítem(s)`}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-tinta-tenue">
            <User className="size-3" aria-hidden />
            {movimiento.registradoPor} · {formatearFecha(movimiento.fecha)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {movimiento.total !== null && (
            <span className="hidden text-sm font-semibold tabular-nums text-tinta sm:block">
              {formatearBs(movimiento.total)}
            </span>
          )}
          <motion.span
            animate={{ rotate: abierto ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-tinta-tenue"
          >
            <ChevronDown className="size-4" aria-hidden />
          </motion.span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="overflow-hidden border-t border-borde"
          >
            <ul className="divide-y divide-borde">
              {movimiento.lineas.map((linea) => (
                <li
                  key={`${linea.tipo}-${linea.id}-${linea.idAlmacen}`}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  {linea.tipo === 'insumo' ? (
                    <Boxes className="size-4 shrink-0 text-info" aria-hidden />
                  ) : (
                    <Package className="size-4 shrink-0 text-marca-400" aria-hidden />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-tinta">{linea.nombre}</p>
                    <p className="mt-0.5 text-[11px] text-tinta-tenue">{linea.almacen}</p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums text-tinta">
                      {formatearCantidad(linea.cantidad)} {linea.unidad}
                    </p>
                    {linea.subtotal !== null && (
                      <p className="mt-0.5 text-[11px] tabular-nums text-tinta-tenue">
                        {formatearBs(linea.subtotal)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {movimiento.total !== null && (
              <div className="flex items-center justify-between bg-white/[0.02] px-4 py-3">
                <span className="text-sm text-tinta-suave">Total</span>
                <span className="text-base font-semibold tabular-nums text-marca-300">
                  {formatearBs(movimiento.total)}
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
