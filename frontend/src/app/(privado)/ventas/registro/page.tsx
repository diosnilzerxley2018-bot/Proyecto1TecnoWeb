'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Armchair,
  Banknote,
  ChefHat,
  CreditCard,
  Minus,
  Plus,
  QrCode,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { RequierePermiso } from '@/components/RequierePermiso';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { Boton } from '@/components/ui/Boton';
import { Selector } from '@/components/ui/Selector';
import { Dialogo } from '@/components/ui/Dialogo';
import { Comprobante } from '@/components/ventas/Comprobante';
import { PanelProduccion } from '@/components/ventas/PanelProduccion';
import { DialogoCobro } from '@/components/ventas/DialogoCobro';
import type {
  Cliente,
  Comprobante as ComprobanteDatos,
  EvaluacionVenta,
  MetodoPago,
  Pago,
  Pagina,
  ProductoCatalogo,
  TipoVenta,
  Venta,
  VentaConProduccion,
} from '@/types';
import { formatearBs } from '@/lib/formato';
import { cn } from '@/lib/cn';

interface LineaTicket {
  idProducto: number;
  nombre: string;
  precio: number;
  cantidad: number;
  stockDisponible: number;
}

const METODOS: { valor: MetodoPago; icono: typeof Banknote }[] = [
  { valor: 'Efectivo', icono: Banknote },
  { valor: 'QR', icono: QrCode },
  { valor: 'Tarjeta', icono: CreditCard },
];

/**
 * CU-VEN-01 — Gestionar Venta. Registro de ventas presenciales.
 *
 * El mostrador admite pedir más de lo elaborado: si el producto tiene receta
 * activa, el sistema lo prepara al instante dentro de la misma transacción de
 * la venta (extensión «Producir al Instante»). Por eso la cantidad no se topa
 * en las existencias: se topa en lo que la cocina puede hacer, y eso lo decide
 * el servidor al evaluar.
 */
export default function PaginaPuntoDeVenta() {
  return (
    <RequierePermiso permiso="VENTA_REGISTRAR">
      <PuntoDeVenta />
    </RequierePermiso>
  );
}

function PuntoDeVenta() {
  const { notificar } = useNotificaciones();

  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  const [ticket, setTicket] = useState<LineaTicket[]>([]);
  const [tipoVenta, setTipoVenta] = useState<TipoVenta>('Mesa');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('Efectivo');
  const [idCliente, setIdCliente] = useState<number | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [comprobante, setComprobante] = useState<ComprobanteDatos | null>(null);

  // Evaluación previa de la producción al instante.
  // Cobro en curso: el mostrador muestra el QR y espera la acreditación.
  const [cobro, setCobro] = useState<Pago | null>(null);

  const [evaluacion, setEvaluacion] = useState<EvaluacionVenta | null>(null);
  const [evaluando, setEvaluando] = useState(false);
  const [destinos, setDestinos] = useState<Record<number, number>>({});

  const cargar = useCallback(async () => {
    try {
      const [catalogo, listaClientes] = await Promise.all([
        api.get<ProductoCatalogo[]>('/catalogo'),
        /*
         * La ficha de cliente es opcional en la venta; si el usuario no tiene
         * el permiso, el selector simplemente queda vacío.
         *
         * El listado viene por páginas (H7) y aquí se pide el máximo: el
         * selector necesita elegir entre muchos de una vez. Si el negocio
         * supera ese número, el paso siguiente es buscar por nombre contra el
         * servidor en lugar de subir el tope.
         */
        api
          .get<Pagina<Cliente>>('/clientes?porPagina=100')
          .catch(() => ({ datos: [] as Cliente[] })),
      ]);
      setProductos(catalogo);
      setClientes(listaClientes.datos);
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo cargar el catálogo');
    } finally {
      setCargando(false);
    }
  }, [notificar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return productos;
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(termino) ||
        p.categoria.nombre.toLowerCase().includes(termino),
    );
  }, [productos, busqueda]);

  const total = ticket.reduce((suma, l) => suma + l.precio * l.cantidad, 0);
  const cantidadDe = (id: number) => ticket.find((l) => l.idProducto === id)?.cantidad ?? 0;

  function agregar(producto: ProductoCatalogo) {
    setTicket((actual) => {
      const existente = actual.find((l) => l.idProducto === producto.id);
      if (existente) {
        return actual.map((l) =>
          l.idProducto === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l,
        );
      }
      return [
        ...actual,
        {
          idProducto: producto.id,
          nombre: producto.nombre,
          precio: producto.precio,
          cantidad: 1,
          stockDisponible: producto.stockDisponible,
        },
      ];
    });
  }

  function cambiar(idProducto: number, cantidad: number) {
    setTicket((actual) =>
      cantidad <= 0
        ? actual.filter((l) => l.idProducto !== idProducto)
        : actual.map((l) => (l.idProducto === idProducto ? { ...l, cantidad } : l)),
    );
  }

  const items = useMemo(
    () => ticket.map((l) => ({ idProducto: l.idProducto, cantidad: l.cantidad })),
    [ticket],
  );

  /** Alguna línea supera lo elaborado, así que habrá que preparar en el momento. */
  const excedeStock = ticket.some((l) => l.cantidad > l.stockDisponible);

  /**
   * Consulta al servidor qué habría que producir, con rebote.
   *
   * Se pregunta al servidor en lugar de deducirlo aquí porque el cálculo
   * depende de la receta activa, de su rendimiento y de los insumos
   * disponibles, y nada de eso vive en el catálogo del mostrador.
   */
  useEffect(() => {
    if (!excedeStock) {
      setEvaluacion(null);
      setEvaluando(false);
      return;
    }

    let vigente = true;
    setEvaluando(true);

    const temporizador = setTimeout(() => {
      api
        .post<EvaluacionVenta>('/ventas/evaluacion', { items })
        .then((resultado) => {
          if (vigente) setEvaluacion(resultado);
        })
        .catch(() => {
          if (vigente) setEvaluacion(null);
        })
        .finally(() => {
          if (vigente) setEvaluando(false);
        });
    }, 350);

    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [items, excedeStock]);

  const requiereProduccion = excedeStock && (evaluacion?.requiereProduccion ?? false);

  /** Con más de un almacén compatible la elección es del vendedor, no del sistema. */
  const faltaElegirDestino = (evaluacion?.lineas ?? []).some(
    (l) =>
      l.requiereProduccion &&
      l.producible &&
      l.requiereElegirAlmacen &&
      destinos[l.idProducto] === undefined,
  );

  const bloqueado =
    ticket.length === 0 ||
    (excedeStock && (evaluando || evaluacion === null || !evaluacion.puedeVenderse || faltaElegirDestino));

  async function mostrarComprobante(idVenta: number) {
    try {
      setComprobante(await api.get<ComprobanteDatos>(`/ventas/${idVenta}/comprobante`));
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo emitir el comprobante');
    }
  }

  async function registrar() {
    setEnviando(true);
    const cuerpo = { tipoVenta, metodoPago, idCliente, items };

    try {
      let venta: Venta;

      if (requiereProduccion) {
        // Producción y venta viajan juntas: el servidor las resuelve en una
        // sola transacción, de modo que no puede quedar producción sin venta.
        const resultado = await api.post<VentaConProduccion>('/ventas/con-produccion', {
          ...cuerpo,
          destinos: Object.entries(destinos).map(([idProducto, idAlmacen]) => ({
            idProducto: Number(idProducto),
            idAlmacen,
          })),
        });
        venta = resultado.venta;

        const elaborado = resultado.producciones.reduce((s, p) => s + p.cantidadProducida, 0);
        if (elaborado > 0) {
          notificar('exito', `Se prepararon ${elaborado} unidad(es) al instante`);
        }
      } else {
        venta = await api.post<Venta>('/ventas', cuerpo);
      }

      // El ticket se limpia igual: la venta ya quedó registrada, aunque el
      // cobro esté pendiente. Insistir con el mismo ticket la duplicaría.
      setTicket([]);
      setIdCliente(null);
      setDestinos({});
      setEvaluacion(null);
      // El stock cambió: se recarga para que el catálogo refleje lo vendido.
      await cargar();

      if (venta.cobro && venta.cobro.estado === 'Pendiente') {
        // El comprobante se emite recién cuando el dinero está: entregarlo
        // antes daría por cobrado algo que todavía no se cobró.
        setCobro(venta.cobro);
        return;
      }

      await mostrarComprobante(venta.id);
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo registrar la venta');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Punto de venta"
        descripcion="Registre ventas en el local: agregue productos, elija el pago y emita el comprobante"
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <section>
          <div className="relative mb-4">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-tinta-tenue"
              aria-hidden
            />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto para agregar"
              aria-label="Buscar productos"
              className="h-12 w-full rounded-2xl border border-borde bg-superficie-alta pl-11 pr-4 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-tenue hover:border-borde-fuerte focus:border-marca-500/60"
            />
          </div>

          {cargando ? (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <EsqueletoFilas key={i} filas={1} alto="h-24" />
              ))}
            </div>
          ) : visibles.length === 0 ? (
            <EstadoVacio
              icono={<UtensilsCrossed className="size-6" aria-hidden />}
              titulo="Sin productos"
              descripcion="Ningún producto coincide con la búsqueda."
              accion={
                <Boton variante="contorno" onClick={() => setBusqueda('')}>
                  Ver todos
                </Boton>
              }
            />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {visibles.map((producto, indice) => {
                const enTicket = cantidadDe(producto.id);
                // Sin existencias el producto no desaparece: se ofrece a pedido.
                // Si además no tiene receta activa, la evaluación lo dirá al
                // agregarlo, con el motivo concreto en lugar de un botón inerte.
                const aPedido = enTicket > producto.stockDisponible;

                return (
                  <motion.button
                    key={producto.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(indice * 0.02, 0.2) }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => agregar(producto)}
                    className={cn(
                      'superficie-tarjeta relative rounded-2xl p-3.5 text-left transition-colors duration-200',
                      'hover:border-marca-500/40 hover:bg-marca-500/[0.06]',
                      enTicket > 0 && 'border-marca-500/40 bg-marca-500/[0.08]',
                      aPedido && 'border-aviso/40 bg-aviso/[0.07]',
                    )}
                  >
                    {enTicket > 0 && (
                      <motion.span
                        key={enTicket}
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        className="absolute right-2.5 top-2.5 grid size-5 place-items-center rounded-full bg-marca-400 text-[10px] font-semibold text-sobre-marca"
                      >
                        {enTicket}
                      </motion.span>
                    )}
                    <p className="pr-6 text-sm font-medium leading-snug text-tinta">
                      {producto.nombre}
                    </p>
                    <p className="mt-1 text-[11px] text-tinta-tenue">{producto.categoria.nombre}</p>
                    <div className="mt-2.5 flex items-end justify-between">
                      <span className="text-sm font-semibold tabular-nums text-marca-300">
                        {formatearBs(producto.precio)}
                      </span>
                      <span
                        className={cn(
                          'flex items-center gap-1 text-[10px]',
                          aPedido ? 'text-aviso' : 'text-tinta-tenue',
                        )}
                      >
                        {aPedido && <ChefHat className="size-3" aria-hidden />}
                        {aPedido
                          ? 'se prepara'
                          : producto.stockDisponible === 0
                            ? 'sin elaborar'
                            : `${producto.stockDisponible} disp.`}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="superficie-tarjeta sticky top-6 rounded-2xl">
          <header className="flex items-center gap-2 border-b border-borde px-5 py-4">
            <ShoppingCart className="size-4 text-marca-400" aria-hidden />
            <h2 className="text-sm font-medium text-tinta">Ticket</h2>
            {ticket.length > 0 && (
              <button
                onClick={() => setTicket([])}
                className="ml-auto text-[11px] text-tinta-tenue transition-colors hover:text-peligro"
              >
                Vaciar
              </button>
            )}
          </header>

          <div className="max-h-72 overflow-y-auto px-3 py-3">
            {ticket.length === 0 ? (
              <p className="py-8 text-center text-xs text-tinta-tenue">
                Pulse un producto para agregarlo
              </p>
            ) : (
              <ul className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {ticket.map((linea) => (
                    <motion.li
                      key={linea.idProducto}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 truncate text-xs text-tinta">
                            {linea.nombre}
                          </p>
                          <button
                            onClick={() => cambiar(linea.idProducto, 0)}
                            aria-label={`Quitar ${linea.nombre}`}
                            className="shrink-0 text-tinta-tenue transition-colors hover:text-peligro"
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <BotonPaso
                              etiqueta="Restar"
                              onClick={() => cambiar(linea.idProducto, linea.cantidad - 1)}
                            >
                              <Minus className="size-3" aria-hidden />
                            </BotonPaso>
                            <span className="w-6 text-center text-xs tabular-nums text-tinta">
                              {linea.cantidad}
                            </span>
                            <BotonPaso
                              etiqueta="Sumar"
                              onClick={() => cambiar(linea.idProducto, linea.cantidad + 1)}
                            >
                              <Plus className="size-3" aria-hidden />
                            </BotonPaso>
                          </div>
                          <span className="text-xs tabular-nums text-tinta-suave">
                            {formatearBs(linea.precio * linea.cantidad)}
                          </span>
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>

          <div className="space-y-4 border-t border-borde px-5 py-4">
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
                Consumo
              </p>
              <div className="grid grid-cols-2 gap-2">
                <BotonOpcion
                  activo={tipoVenta === 'Mesa'}
                  onClick={() => setTipoVenta('Mesa')}
                  icono={<Armchair className="size-4" aria-hidden />}
                >
                  En mesa
                </BotonOpcion>
                <BotonOpcion
                  activo={tipoVenta === 'Llevar'}
                  onClick={() => setTipoVenta('Llevar')}
                  icono={<ShoppingBag className="size-4" aria-hidden />}
                >
                  Para llevar
                </BotonOpcion>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
                Pago
              </p>
              <div className="grid grid-cols-3 gap-2">
                {METODOS.map((metodo) => {
                  const Icono = metodo.icono;
                  return (
                    <BotonOpcion
                      key={metodo.valor}
                      activo={metodoPago === metodo.valor}
                      onClick={() => setMetodoPago(metodo.valor)}
                      icono={<Icono className="size-4" aria-hidden />}
                    >
                      {metodo.valor}
                    </BotonOpcion>
                  );
                })}
              </div>
            </div>

            {clientes.length > 0 && (
              <Selector<number>
                etiqueta="Cliente (opcional)"
                valor={idCliente}
                marcador="Consumidor final"
                onCambiar={(valor) => setIdCliente(valor === -1 ? null : valor)}
                opciones={[
                  { valor: -1, etiqueta: 'Consumidor final' },
                  ...clientes.map((c) => ({
                    valor: c.id,
                    etiqueta: c.nombreCompleto,
                    descripcion: c.email,
                  })),
                ]}
              />
            )}

            <PanelProduccion
              evaluacion={evaluacion}
              cargando={evaluando}
              destinos={destinos}
              onElegirDestino={(idProducto, idAlmacen) =>
                setDestinos((actual) => ({ ...actual, [idProducto]: idAlmacen }))
              }
            />

            <div className="flex items-center justify-between border-t border-borde pt-3">
              <span className="text-sm text-tinta-suave">Total</span>
              <motion.span
                key={total}
                initial={{ opacity: 0.5, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl font-semibold tabular-nums text-marca-300"
              >
                {formatearBs(total)}
              </motion.span>
            </div>

            <Boton
              variante="primario"
              tamano="lg"
              className="w-full justify-center"
              disabled={bloqueado}
              cargando={enviando}
              onClick={registrar}
              icono={requiereProduccion ? <ChefHat className="size-4" aria-hidden /> : undefined}
            >
              {requiereProduccion ? 'Preparar y vender' : 'Registrar venta'}
            </Boton>
          </div>
        </aside>
      </div>

      <DialogoCobro
        pago={cobro}
        permiteConfirmarManual
        onCerrar={() => setCobro(null)}
        onPagado={async (pagado) => {
          notificar('exito', 'Pago acreditado');
          setCobro(null);
          if (pagado.idVenta) await mostrarComprobante(pagado.idVenta);
        }}
      />

      <Dialogo
        abierto={comprobante !== null}
        onCerrar={() => setComprobante(null)}
        titulo="Comprobante"
        ancho="max-w-md"
      >
        {comprobante && (
          <Comprobante datos={comprobante} onCerrar={() => setComprobante(null)} />
        )}
      </Dialogo>
    </>
  );
}

function BotonOpcion({
  activo,
  onClick,
  icono,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  icono: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-[11px] transition-colors duration-200',
        activo
          ? 'border-marca-500/50 bg-marca-500/12 text-marca-300'
          : 'border-borde text-tinta-tenue hover:border-borde-fuerte hover:text-tinta-suave',
      )}
    >
      {icono}
      {children}
    </button>
  );
}

function BotonPaso({
  children,
  etiqueta,
  onClick,
  deshabilitado = false,
}: {
  children: React.ReactNode;
  etiqueta: string;
  onClick: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      whileTap={{ scale: 0.85 }}
      className="grid size-6 place-items-center rounded-md text-tinta-suave transition-colors hover:bg-white/[0.08] hover:text-tinta disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </motion.button>
  );
}
