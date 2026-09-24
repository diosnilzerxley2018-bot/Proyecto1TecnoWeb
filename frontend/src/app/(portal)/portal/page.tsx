'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Flame, Search, ShoppingBasket, Sparkles, UtensilsCrossed } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useCarrito } from '@/context/CarritoContext';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Boton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/Dialogo';
import { Insignia } from '@/components/ui/Insignia';
import { TarjetaCatalogo } from '@/components/portal/TarjetaCatalogo';
import type { Categoria, ProductoCatalogo } from '@/types';
import { formatearBs, formatearCantidad } from '@/lib/formato';
import { cn } from '@/lib/cn';
import { urlImagenProducto } from '@/lib/imagenes';

/** CU-PED-01 — Buscar Productos. Catálogo del portal de pedidos. */
export default function PaginaCatalogo() {
  const { notificar } = useNotificaciones();
  const { lineas, agregar, cambiarCantidad } = useCarrito();

  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [idCategoria, setIdCategoria] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [detalle, setDetalle] = useState<ProductoCatalogo | null>(null);

  /*
   * El buscador del encabezado (RF-PED-03) trae aquí el producto elegido como
   * `?termino=`. Se lee de `window` y no con `useSearchParams` para no obligar
   * a envolver la página en un límite de suspensión: es una lectura única al
   * abrir, no una suscripción.
   */
  useEffect(() => {
    const termino = new URLSearchParams(window.location.search).get('termino');
    if (termino) setBusqueda(termino);
  }, []);

  const cargar = useCallback(async () => {
    try {
      const [lista, listaCategorias] = await Promise.all([
        api.get<ProductoCatalogo[]>('/catalogo'),
        api.get<Categoria[]>('/catalogo/categorias'),
      ]);
      setProductos(lista);
      setCategorias(listaCategorias);
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo cargar el catálogo');
    } finally {
      setCargando(false);
    }
  }, [notificar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * CU-PED-01 admite filtrar por categoría y buscar por coincidencia parcial.
   * Se resuelve en cliente porque el catálogo completo ya está cargado y así
   * la respuesta es inmediata mientras se escribe.
   */
  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return productos.filter((producto) => {
      const coincideCategoria = idCategoria === null || producto.categoria.id === idCategoria;
      const coincideTexto =
        !termino ||
        producto.nombre.toLowerCase().includes(termino) ||
        producto.categoria.nombre.toLowerCase().includes(termino);
      return coincideCategoria && coincideTexto;
    });
  }, [productos, idCategoria, busqueda]);

  const cantidadDe = (id: number) => lineas.find((l) => l.idProducto === id)?.cantidad ?? 0;
  const urlFotoDetalle = detalle && urlImagenProducto(detalle.id, detalle.imagenActualizadaEn);

  return (
    <>     
      <motion.section
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative mb-8 overflow-hidden rounded-3xl border border-borde px-6 py-10 sm:px-10 sm:py-12"
      >
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-br from-marca-500/15 via-transparent to-info/10"
          aria-hidden
        />
        <div className="absolute -right-16 -top-16 -z-10 size-64 rounded-full bg-marca-500/15 blur-3xl" aria-hidden />

        <Insignia tono="marca">
          <Sparkles className="size-3" aria-hidden />
          Elaborado el mismo día
        </Insignia>
        <h1 className="mt-4 max-w-lg text-3xl font-semibold tracking-tight text-tinta sm:text-4xl">
          Comida saludable, a la puerta de su casa
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-tinta-suave">
          Elija sus platos, indique la dirección de entrega y confirme. Cada producto muestra su
          información nutricional para que sepa exactamente qué está comiendo.
        </p>
      </motion.section>

      <div className="mb-6 flex flex-col gap-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
            aria-hidden
          />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar un plato o una categoría"
            aria-label="Buscar en el catálogo"
            className="h-12 w-full rounded-2xl border border-borde bg-superficie-alta pl-11 pr-4 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-tenue hover:border-borde-fuerte focus:border-marca-500/60"
          />
        </div>

        {categorias.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Pildora activa={idCategoria === null} onClick={() => setIdCategoria(null)}>
              Todo
            </Pildora>
            {categorias.map((categoria) => (
              <Pildora
                key={categoria.id}
                activa={idCategoria === categoria.id}
                onClick={() => setIdCategoria(categoria.id)}
              >
                {categoria.nombre}
              </Pildora>
            ))}
          </div>
        )}
      </div>

      {cargando ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <EsqueletoFilas key={i} filas={1} alto="h-72" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <EstadoVacio
          icono={<UtensilsCrossed className="size-6" aria-hidden />}
          titulo="No encontramos coincidencias"
          descripcion="Pruebe con otro término o revise el catálogo completo."
          accion={
            <Boton
              variante="contorno"
              onClick={() => {
                setBusqueda('');
                setIdCategoria(null);
              }}
            >
              Ver todo el catálogo
            </Boton>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visibles.map((producto, indice) => (
              <TarjetaCatalogo
                key={producto.id}
                producto={producto}
                indice={indice}
                cantidadEnCarrito={cantidadDe(producto.id)}
                onAgregar={() => agregar(producto)}
                onCambiarCantidad={(cantidad) => cambiarCantidad(producto.id, cantidad)}
                onVerDetalle={() => setDetalle(producto)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <Dialogo
        abierto={detalle !== null}
        onCerrar={() => setDetalle(null)}
        titulo={detalle?.nombre ?? ''}
        descripcion={detalle?.categoria.nombre}
      >
        {detalle && (
          <div className="space-y-5">
            {urlFotoDetalle && (
              <div className="-mt-1 overflow-hidden rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urlFotoDetalle}
                  alt={detalle.nombre}
                  className="aspect-video w-full object-cover"
                />
              </div>
            )}

            <p className="text-sm leading-relaxed text-tinta-suave">
              {detalle.descripcion ?? 'Sin descripción disponible.'}
            </p>

            {detalle.valorNutricional ? (
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
                  <Flame className="size-3.5 text-aviso" aria-hidden />
                  Información nutricional por porción
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <DatoNutricional etiqueta="Calorías" valor={`${detalle.valorNutricional.calorias} kcal`} />
                  <DatoNutricional
                    etiqueta="Proteínas"
                    valor={`${formatearCantidad(detalle.valorNutricional.proteinas)} g`}
                  />
                  <DatoNutricional
                    etiqueta="Carbohidratos"
                    valor={`${formatearCantidad(detalle.valorNutricional.carbohidratos)} g`}
                  />
                  <DatoNutricional
                    etiqueta="Grasas"
                    valor={`${formatearCantidad(detalle.valorNutricional.grasas)} g`}
                  />
                </div>
                {detalle.valorNutricional.fibra !== null && (
                  <p className="mt-2 text-xs text-tinta-tenue">
                    Fibra: {formatearCantidad(detalle.valorNutricional.fibra)} g
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-xl border border-borde bg-white/[0.02] px-3.5 py-2.5 text-xs text-tinta-tenue">
                Este producto todavía no tiene información nutricional registrada.
              </p>
            )}

            <div className="flex items-center justify-between border-t border-borde pt-4">
              <div>
                <p className="text-xl font-semibold tabular-nums text-tinta">
                  {formatearBs(detalle.precio)}
                </p>
                <p className="mt-0.5 text-[11px] text-tinta-tenue">
                  {detalle.disponible ? `${detalle.stockDisponible} disponibles` : 'Sin stock'}
                </p>
              </div>
              <Boton
                variante="primario"
                disabled={!detalle.disponible}
                onClick={() => {
                  agregar(detalle);
                  setDetalle(null);
                }}
                icono={<ShoppingBasket className="size-4" aria-hidden />}
              >
                Agregar al carrito
              </Boton>
            </div>
          </div>
        )}
      </Dialogo>
    </>
  );
}

function Pildora({
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
        'rounded-full border px-3.5 py-2 text-xs transition-colors duration-200',
        activa
          ? 'border-marca-500/40 bg-marca-500/12 text-marca-300'
          : 'border-borde text-tinta-tenue hover:border-borde-fuerte hover:text-tinta-suave',
      )}
    >
      {children}
    </button>
  );
}

function DatoNutricional({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-xl border border-borde bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-tinta-tenue">{etiqueta}</p>
      <p className="mt-1 text-sm tabular-nums text-tinta">{valor}</p>
    </div>
  );
}
