'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChefHat,
  Flame,
  Package,
  Plus,
  Search,
  Snowflake,
  Sparkles,
  Sun,
} from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { RequierePermiso } from '@/components/RequierePermiso';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { Estadistica } from '@/components/ui/Estadistica';
import { ChipsFiltro } from '@/components/ui/ChipsFiltro';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Tarjeta } from '@/components/ui/Tarjeta';
import { Insignia } from '@/components/ui/Insignia';
import { Boton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/Dialogo';
import { FormularioProducto } from '@/components/produccion/FormularioProducto';
import { PanelProducto } from '@/components/produccion/PanelProducto';
import type { Categoria, Producto } from '@/types';
import { formatearBs, formatearCantidad } from '@/lib/formato';
import { cn } from '@/lib/cn';
import { urlImagenProducto } from '@/lib/imagenes';
import { coincide } from '@/lib/texto';
import { useEnlaceDirecto } from '@/components/ui/usarEnlaceDirecto';

/** CU-PRO-01 Gestionar Producto y Receta, con CU-PRO-03 como extensión. */
export default function PaginaProduccion() {
  return (
    <RequierePermiso permiso="PRODUCTO_GESTIONAR">
      <CatalogoProductos />
    </RequierePermiso>
  );
}

type Vista = 'activos' | 'sinNutricion' | 'todos';

function CatalogoProductos() {
  const { tienePermiso } = useAuth();
  const { notificar } = useNotificaciones();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<Vista>('activos');
  const [idCategoria, setIdCategoria] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [idAbierto, setIdAbierto] = useState<number | null>(null);

  // `?producto=` llega del buscador general: abre el panel de ese producto.
  useEnlaceDirecto(['producto'], ({ producto }) => {
    if (Number(producto) > 0) setIdAbierto(Number(producto));
  });

  const puedeGestionar = tienePermiso('PRODUCTO_GESTIONAR');

  const cargar = useCallback(async () => {
    try {
      const [lista, listaCategorias] = await Promise.all([
        api.get<Producto[]>('/productos?incluirInactivos=true'),
        api.get<Categoria[]>('/catalogo/categorias'),
      ]);
      setProductos(lista);
      setCategorias(listaCategorias);
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudieron cargar los productos');
    } finally {
      setCargando(false);
    }
  }, [notificar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const activos = useMemo(() => productos.filter((p) => p.activo), [productos]);
  const sinNutricion = useMemo(
    () => activos.filter((p) => p.valorNutricional === null),
    [activos],
  );

  const visibles = useMemo(() => {
    const base =
      vista === 'todos' ? productos : vista === 'sinNutricion' ? sinNutricion : activos;
    return base.filter((producto) => {
      const coincideCategoria = idCategoria === null || producto.categoria.id === idCategoria;
      return coincideCategoria && coincide(producto.nombre, busqueda);
    });
  }, [productos, activos, sinNutricion, vista, idCategoria, busqueda]);

  const abierto = productos.find((p) => p.id === idAbierto) ?? null;

  return (
    <>
      <EncabezadoPagina
        titulo="Producción"
        descripcion="Productos que ofrece el negocio, su información nutricional y las recetas con que se elaboran"
        acciones={
          puedeGestionar && (
            <Boton
              variante="primario"
              onClick={() => setCreando(true)}
              icono={<Plus className="size-4" aria-hidden />}
            >
              Nuevo producto
            </Boton>
          )
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Estadistica
          indice={0}
          etiqueta="Productos activos"
          valor={activos.length}
          tono="marca"
          icono={<Package className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={1}
          etiqueta="Sin información nutricional"
          valor={sinNutricion.length}
          tono={sinNutricion.length > 0 ? 'aviso' : 'neutro'}
          icono={<Sparkles className="size-5" aria-hidden />}
        />
        <Estadistica
          indice={2}
          etiqueta="Categorías"
          valor={categorias.length}
          tono="info"
          icono={<ChefHat className="size-5" aria-hidden />}
        />
      </div>

      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <ChipsFiltro<Vista>
          idGrupo="filtro-produccion"
          valor={vista}
          onCambiar={setVista}
          opciones={[
            { valor: 'activos', etiqueta: 'Activos', cantidad: activos.length },
            { valor: 'sinNutricion', etiqueta: 'Sin nutrición', cantidad: sinNutricion.length },
            { valor: 'todos', etiqueta: 'Todos', cantidad: productos.length },
          ]}
        />

        <div className="relative xl:w-72">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
            aria-hidden
          />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto"
            aria-label="Buscar productos"
            className="h-10 w-full rounded-xl border border-borde bg-superficie-alta pl-10 pr-3 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-tenue hover:border-borde-fuerte focus:border-marca-500/60"
          />
        </div>
      </div>

      {categorias.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          <BotonCategoria activa={idCategoria === null} onClick={() => setIdCategoria(null)}>
            Todas
          </BotonCategoria>
          {categorias.map((categoria) => (
            <BotonCategoria
              key={categoria.id}
              activa={idCategoria === categoria.id}
              onClick={() => setIdCategoria(categoria.id)}
            >
              {categoria.nombre}
            </BotonCategoria>
          ))}
        </div>
      )}

      {cargando ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <EsqueletoFilas key={i} filas={1} alto="h-48" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <EstadoVacio
          icono={<ChefHat className="size-6" aria-hidden />}
          titulo={productos.length === 0 ? 'No hay productos registrados' : 'Sin coincidencias'}
          descripcion={
            productos.length === 0
              ? 'Registre los productos que ofrece el negocio para definir sus recetas y ponerlos en el catálogo.'
              : 'Ningún producto coincide con los filtros aplicados.'
          }
          accion={
            productos.length === 0
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
                      setIdCategoria(null);
                    }}
                  >
                    Limpiar filtros
                  </Boton>
                )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visibles.map((producto, indice) => (
              <TarjetaProducto
                key={producto.id}
                producto={producto}
                indice={indice}
                onAbrir={() => setIdAbierto(producto.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <Dialogo
        abierto={creando}
        onCerrar={() => setCreando(false)}
        titulo="Nuevo producto"
        descripcion="La foto, la información nutricional y la receta se agregan después, desde su ficha"
      >
        <FormularioProducto
          onCancelar={() => setCreando(false)}
          onListo={() => {
            setCreando(false);
            void cargar();
          }}
        />
      </Dialogo>

      <PanelProducto
        producto={abierto}
        puedeGestionar={puedeGestionar}
        onCerrar={() => setIdAbierto(null)}
        onCambio={() => void cargar()}
      />
    </>
  );
}

function BotonCategoria({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs transition-colors duration-200',
        activa
          ? 'border-marca-500/40 bg-marca-500/12 text-marca-300'
          : 'border-borde text-tinta-tenue hover:border-borde-fuerte hover:text-tinta-suave',
      )}
    >
      {children}
    </button>
  );
}

function TarjetaProducto({
  producto,
  indice,
  onAbrir,
}: {
  producto: Producto;
  indice: number;
  onAbrir: () => void;
}) {
  const frio = producto.tipoConservacion === 'Refrigerado';
  const urlFoto = urlImagenProducto(producto.id, producto.imagenActualizadaEn);

  return (
    <Tarjeta
      interactiva
      layout
      onClick={onAbrir}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, delay: Math.min(indice * 0.04, 0.3), ease: 'easeOut' }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAbrir();
        }
      }}
      className={cn('group flex flex-col p-4', !producto.activo && 'opacity-60')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {urlFoto && (
            <span className="size-10 shrink-0 overflow-hidden rounded-lg border border-borde bg-white/[0.02]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlFoto} alt="" className="size-full object-cover" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-tinta">{producto.nombre}</p>
            <p className="mt-0.5 text-[11px] text-tinta-tenue">{producto.categoria.nombre}</p>
          </div>
        </div>
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg border',
            frio ? 'border-info/25 bg-info/10 text-info' : 'border-aviso/25 bg-aviso/10 text-aviso',
          )}
          title={producto.tipoConservacion}
        >
          {frio ? <Snowflake className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
        </span>
      </div>

      <p className="mt-2.5 line-clamp-2 min-h-8 text-xs leading-relaxed text-tinta-tenue">
        {producto.descripcion ?? 'Sin descripción'}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {producto.valorNutricional ? (
          <Insignia tono="aviso">
            <Flame className="size-3" aria-hidden />
            {producto.valorNutricional.calorias} kcal
          </Insignia>
        ) : (
          <Insignia tono="neutro">Sin nutrición</Insignia>
        )}
        {!producto.activo && <Insignia tono="peligro">Dado de baja</Insignia>}
      </div>

      <div className="mt-4 flex items-end justify-between border-t border-borde pt-3">
        <span className="text-[11px] text-tinta-tenue">
          {producto.stockTotal > 0 ? (
            <>
              <span className="tabular-nums text-tinta-suave">
                {formatearCantidad(producto.stockTotal)}
              </span>{' '}
              en stock
            </>
          ) : (
            'Sin existencias'
          )}
        </span>
        <span className="font-semibold tabular-nums text-marca-300">
          {formatearBs(producto.precio)}
        </span>
      </div>
    </Tarjeta>
  );
}
