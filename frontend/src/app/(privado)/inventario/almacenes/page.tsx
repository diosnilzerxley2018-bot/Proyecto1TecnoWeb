'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { MapPin, Pencil, Plus, Snowflake, Star, Sun, Trash2, Warehouse } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { Tarjeta } from '@/components/ui/Tarjeta';
import { Insignia } from '@/components/ui/Insignia';
import { Boton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/Dialogo';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Tooltip } from '@/components/ui/Tooltip';
import { FormularioAlmacen } from '@/components/inventario/FormularioAlmacen';
import type { Almacen } from '@/types';

/** CU-INV-02 — Gestionar Almacén. Actor del caso de uso: Administrador. */
export default function PaginaAlmacenes() {
  const { tienePermiso } = useAuth();
  const { notificar } = useNotificaciones();

  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Almacen | null>(null);
  const [creando, setCreando] = useState(false);
  const [porEliminar, setPorEliminar] = useState<Almacen | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const puedeGestionar = tienePermiso('ALMACEN_GESTIONAR');

  const cargar = useCallback(async () => {
    try {
      setAlmacenes(await api.get<Almacen[]>('/almacenes'));
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar los almacenes');
    } finally {
      setCargando(false);
    }
  }, [notificar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await api.del(`/almacenes/${porEliminar.id}`);
      notificar('exito', `Almacén "${porEliminar.nombre}" eliminado`);
      setPorEliminar(null);
      await cargar();
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo eliminar el almacén');
    } finally {
      setEliminando(false);
    }
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Almacenes"
        descripcion="Espacios de guardado, definidos por su condición de conservación"
        acciones={
          puedeGestionar && (
            <Boton
              variante="primario"
              onClick={() => setCreando(true)}
              icono={<Plus className="size-4" aria-hidden />}
            >
              Nuevo almacén
            </Boton>
          )
        }
      />

      {cargando ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <EsqueletoFilas key={i} filas={1} alto="h-36" />
          ))}
        </div>
      ) : almacenes.length === 0 ? (
        <EstadoVacio
          icono={<Warehouse className="size-6" aria-hidden />}
          titulo="No hay almacenes registrados"
          descripcion="Sin almacenes no es posible registrar existencias ni movimientos de inventario."
          accion={
            puedeGestionar && (
              <Boton variante="primario" onClick={() => setCreando(true)}>
                Registrar el primero
              </Boton>
            )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {almacenes.map((almacen, indice) => (
              <TarjetaAlmacen
                key={almacen.id}
                almacen={almacen}
                indice={indice}
                puedeGestionar={puedeGestionar}
                onEditar={() => setEditando(almacen)}
                onEliminar={() => setPorEliminar(almacen)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <Dialogo
        abierto={creando}
        onCerrar={() => setCreando(false)}
        titulo="Nuevo almacén"
        descripcion="Defina su nombre y la condición de conservación que admite"
      >
        <FormularioAlmacen
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
          <FormularioAlmacen
            almacen={editando}
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
        titulo="Eliminar almacén"
        ancho="max-w-md"
      >
        <p className="text-sm text-tinta-suave">
          ¿Confirma eliminar <span className="text-tinta">{porEliminar?.nombre}</span>? Esta
          operación no se puede deshacer.
        </p>
        <p className="mt-2 text-xs text-tinta-tenue">
          Si el almacén registra existencias o movimientos, el sistema lo impedirá: la tabla no
          admite baja lógica, de modo que o está libre o se conserva.
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

function TarjetaAlmacen({
  almacen,
  indice,
  puedeGestionar,
  onEditar,
  onEliminar,
}: {
  almacen: Almacen;
  indice: number;
  puedeGestionar: boolean;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const frio = almacen.tipoConservacion === 'Refrigerado';

  return (
    <Tarjeta
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, delay: indice * 0.05, ease: 'easeOut' }}
      className="group relative overflow-hidden p-5"
    >
      <div
        className={`pointer-events-none absolute -right-8 -top-8 size-28 rounded-full blur-2xl transition-opacity duration-500 group-hover:opacity-100 ${
          frio ? 'bg-info/15' : 'bg-aviso/12'
        } opacity-60`}
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl border ${
              frio
                ? 'border-info/25 bg-info/10 text-info'
                : 'border-aviso/25 bg-aviso/10 text-aviso'
            }`}
          >
            {frio ? <Snowflake className="size-5" aria-hidden /> : <Sun className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-tinta">{almacen.nombre}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Insignia tono={frio ? 'info' : 'aviso'}>{almacen.tipoConservacion}</Insignia>
              {almacen.preferido && (
                <Tooltip texto={`Destino por omisión de lo que se produce ${frio ? 'refrigerado' : 'seco'}`}>
                  <span>
                    <Insignia tono="marca">
                      <Star className="mr-1 size-3" aria-hidden />
                      Preferido
                    </Insignia>
                  </span>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {puedeGestionar && (
          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
            <Tooltip texto="Editar">
              <Boton tamano="icono" variante="fantasma" onClick={onEditar} aria-label="Editar almacén">
                <Pencil className="size-4" aria-hidden />
              </Boton>
            </Tooltip>
            <Tooltip texto="Eliminar">
              <Boton
                tamano="icono"
                variante="fantasma"
                onClick={onEliminar}
                aria-label="Eliminar almacén"
                className="hover:bg-peligro/15 hover:text-peligro"
              >
                <Trash2 className="size-4" aria-hidden />
              </Boton>
            </Tooltip>
          </div>
        )}
      </div>

      <p className="relative mt-4 flex items-start gap-2 text-xs text-tinta-tenue">
        <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {almacen.ubicacionFisica ?? 'Sin ubicación física registrada'}
      </p>
    </Tarjeta>
  );
}
