'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AlertTriangle, Boxes, Coins, Package, Plus, Search } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { Estadistica } from '@/components/ui/Estadistica';
import { ChipsFiltro } from '@/components/ui/ChipsFiltro';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Boton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/Dialogo';
import { FormularioInsumo } from '@/components/inventario/FormularioInsumo';
import { FilaInsumo } from '@/components/inventario/FilaInsumo';
import type { Insumo } from '@/types';
import { coincide } from '@/lib/texto';
import { formatearBs } from '@/lib/formato';

type Vista = 'activos' | 'criticos' | 'todos';

/** CU-INV-01 — Gestionar Insumo. Actor del caso de uso: Empleado. */
export default function PaginaInsumos() {
  const { tienePermiso } = useAuth();
  const { notificar } = useNotificaciones();

  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<Vista>('activos');
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Insumo | null>(null);
  const [porEliminar, setPorEliminar] = useState<Insumo | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const puedeGestionar = tienePermiso('INSUMO_GESTIONAR');

  /**
   * Se piden siempre incluyendo los inactivos y el filtrado ocurre aquí: la
   * pantalla necesita contar los críticos sobre el conjunto completo, no sobre
   * el subconjunto que esté mirando el usuario.
   */
  const cargar = useCallback(async () => {
    try {
      setInsumos(await api.get<Insumo[]>('/insumos?incluirInactivos=true'));
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar los insumos');
    } finally {
      setCargando(false);
    }
  }, [notificar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const activos = useMemo(() => insumos.filter((i) => i.activo), [insumos]);
  const criticos = useMemo(
    () => activos.filter((i) => i.stockTotal <= i.stockMinimo),
    [activos],
  );
  const valorInventario = useMemo(
    () => activos.reduce((total, i) => total + i.stockTotal * i.costoUnitario, 0),
    [activos],
  );

  const visibles = useMemo(() => {
    const base = vista === 'todos' ? insumos : vista === 'criticos' ? criticos : activos;
    // Sin tildes ni mayúsculas: «limon» encuentra el «Limón».
    return base.filter((i) => coincide(i.nombre, busqueda));
  }, [insumos, activos, criticos, vista, busqueda]);

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await api.del(`/insumos/${porEliminar.id}`);
      notificar('exito', `Insumo "${porEliminar.nombre}" eliminado`);
      setPorEliminar(null);
      await cargar();
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo eliminar el insumo');
    } finally {
      setEliminando(false);
    }
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Insumos"
        descripcion="Catálogo de insumos, con su unidad, costo promedio de compra y nivel de reposición"
        acciones={
          puedeGestionar && (
            <Boton
              variante="primario"
              onClick={() => setCreando(true)}
              icono={<Plus className="size-4" aria-hidden />}
            >
              Nuevo insumo
            </Boton>
          )
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Estadistica
          indice={0}
          etiqueta="Insumos activos"
          valor={activos.length}
          tono="marca"
          icono={<Package className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={1}
          etiqueta="En nivel crítico"
          valor={criticos.length}
          tono={criticos.length > 0 ? 'aviso' : 'neutro'}
          icono={<AlertTriangle className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={2}
          etiqueta="Valor en existencias"
          valor={formatearBs(valorInventario)}
          tono="info"
          icono={<Coins className="size-5" aria-hidden />}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ChipsFiltro<Vista>
          idGrupo="filtro-insumos"
          valor={vista}
          onCambiar={setVista}
          opciones={[
            { valor: 'activos', etiqueta: 'Activos', cantidad: activos.length },
            { valor: 'criticos', etiqueta: 'Por reponer', cantidad: criticos.length },
            { valor: 'todos', etiqueta: 'Todos', cantidad: insumos.length },
          ]}
        />

        <div className="relative lg:w-72">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
            aria-hidden
          />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar insumo"
            aria-label="Buscar insumos"
            className="h-10 w-full rounded-xl border border-borde bg-superficie-alta pl-10 pr-3 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-tenue hover:border-borde-fuerte focus:border-marca-500/60"
          />
        </div>
      </div>

      {cargando ? (
        <EsqueletoFilas filas={7} alto="h-16" />
      ) : visibles.length === 0 ? (
        <EstadoVacio
          icono={<Boxes className="size-6" aria-hidden />}
          titulo={
            insumos.length === 0
              ? 'No hay insumos registrados'
              : vista === 'criticos' && busqueda.trim() === ''
                ? 'Ningún insumo por reponer'
                : 'Sin coincidencias'
          }
          descripcion={
            insumos.length === 0
              ? 'Registre los insumos que utiliza la cocina para poder definir recetas y controlar existencias.'
              : vista === 'criticos' && busqueda.trim() === ''
                ? 'Todos los insumos activos están por encima de su stock mínimo.'
                : 'Ningún insumo coincide con la vista y la búsqueda actuales.'
          }
          accion={
            insumos.length === 0
              ? puedeGestionar && (
                  <Boton variante="primario" onClick={() => setCreando(true)}>
                    Registrar el primero
                  </Boton>
                )
              : (
                  <Boton
                    variante="contorno"
                    onClick={() => {
                      setVista('todos');
                      setBusqueda('');
                    }}
                  >
                    Limpiar filtros
                  </Boton>
                )
          }
        />
      ) : (
        <div className="superficie-tarjeta overflow-hidden rounded-2xl">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))_auto] gap-3 border-b border-borde px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue md:grid">
            <span>Insumo</span>
            <span>Costo promedio</span>
            <span>Stock mínimo</span>
            <span>Existencias</span>
            {puedeGestionar && <span className="w-[76px]" />}
          </div>

          <ul className="divide-y divide-borde">
            <AnimatePresence mode="popLayout">
              {visibles.map((insumo, indice) => (
                <FilaInsumo
                  key={insumo.id}
                  insumo={insumo}
                  indice={indice}
                  puedeGestionar={puedeGestionar}
                  onEditar={() => setEditando(insumo)}
                  onEliminar={() => setPorEliminar(insumo)}
                />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}

      <Dialogo
        abierto={creando}
        onCerrar={() => setCreando(false)}
        titulo="Nuevo insumo"
        descripcion="Su unidad de medida no podrá cambiarse una vez que registre existencias"
      >
        <FormularioInsumo
          onCancelar={() => setCreando(false)}
          onListo={() => {
            setCreando(false);
            void cargar();
          }}
        />
      </Dialogo>

      <Dialogo
        abierto={editando !== null}
        onCerrar={() => setEditando(null)}
        titulo={`Editar ${editando?.nombre ?? ''}`}
      >
        {editando && (
          <FormularioInsumo
            insumo={editando}
            onCancelar={() => setEditando(null)}
            onListo={() => {
              setEditando(null);
              void cargar();
            }}
          />
        )}
      </Dialogo>

      <Dialogo
        abierto={porEliminar !== null}
        onCerrar={() => setPorEliminar(null)}
        titulo="Eliminar insumo"
        ancho="max-w-md"
      >
        <p className="text-sm text-tinta-suave">
          ¿Confirma eliminar <span className="text-tinta">{porEliminar?.nombre}</span>?
        </p>
        <p className="mt-2 text-xs text-tinta-tenue">
          Si forma parte de alguna receta, tiene movimientos registrados o existencias en almacén,
          el sistema lo impedirá. En ese caso puede darlo de baja desde la edición, que conserva su
          historial.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Boton variante="fantasma" onClick={() => setPorEliminar(null)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" cargando={eliminando} onClick={eliminar}>
            Eliminar
          </Boton>
        </div>
      </Dialogo>
    </>
  );
}
