'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Banknote, CreditCard, MapPin, Minus, Plus, QrCode, ShoppingBasket, Trash2 } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { DialogoCobro } from '@/components/ventas/DialogoCobro';
import { SelectorDireccion } from '@/components/pedidos/SelectorDireccion';
import { useCarrito } from '@/context/CarritoContext';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { Boton } from '@/components/ui/Boton';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { Tooltip } from '@/components/ui/Tooltip';
import type {
  DestinoPedido, MetodoPago, Pago, PedidoCliente } from '@/types';
import { formatearBs } from '@/lib/formato';
import { cn } from '@/lib/cn';

type Paso = 'carrito' | 'entrega';

const METODOS: { valor: MetodoPago; etiqueta: string; icono: typeof Banknote; ayuda: string }[] = [
  { valor: 'Efectivo', etiqueta: 'Efectivo', icono: Banknote, ayuda: 'Paga al recibir el pedido' },
  { valor: 'QR', etiqueta: 'QR', icono: QrCode, ayuda: 'Pago en línea con código QR' },
  { valor: 'Tarjeta', etiqueta: 'Tarjeta', icono: CreditCard, ayuda: 'Pago en línea con tarjeta' },
];

/** CU-PED-02 Gestionar Pedido, con CU-PED-03 Ubicación y CU-PED-04 Pago en línea. */
export default function PaginaCarrito() {
  const router = useRouter();
  const { notificar } = useNotificaciones();
  const { lineas, importeTotal, cambiarCantidad, quitar, vaciar } = useCarrito();

  const [paso, setPaso] = useState<Paso>('carrito');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('Efectivo');
  /**
   * Destino ya resuelto por el selector: una dirección guardada o una escrita
   * en el momento. Nulo mientras esté incompleta, y eso es lo que deshabilita
   * el botón de confirmar.
   */
  const [destino, setDestino] = useState<DestinoPedido | null>(null);

  const [cobro, setCobro] = useState<Pago | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pagoEnLinea = metodoPago !== 'Efectivo';

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    setEnviando(true);
    try {
      const pedido = await api.post<PedidoCliente>('/pedidos', {
        metodoPago,
        ubicacion: destino,
        items: lineas.map((l) => ({ idProducto: l.idProducto, cantidad: l.cantidad })),
      });

      vaciar();

      if (pedido.cobro && pedido.cobro.estado === 'Pendiente') {
        // El pedido existe y reservó su stock, pero todavía no está pagado:
        // se le muestra el código en lugar de mandarlo al listado a esperar.
        setCobro(pedido.cobro);
        return;
      }

      /*
       * Sin cobro pendiente el pedido ya está en firme: o se paga en efectivo
       * al recibirlo, o la pasarela no pudo abrirlo. Lo segundo se avisa, en
       * vez de dar por bueno un pago que no ocurrió.
       */
      if (pedido.cobro?.estado === 'Fallido') {
        notificar(
          'info',
          `Pedido #${String(pedido.id).padStart(5, '0')} confirmado, pero no se pudo ` +
            'generar el cobro en línea. Puede pagarlo al recibirlo.',
        );
      } else {
        notificar('exito', `Pedido #${String(pedido.id).padStart(5, '0')} confirmado`);
      }
      router.push('/portal/pedidos');
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo confirmar el pedido');
    } finally {
      setEnviando(false);
    }
  }

  /*
   * El carrito vacío no se muestra mientras haya un cobro en pantalla.
   *
   * Confirmar el pedido vacía el carrito —el pedido ya existe y reservó su
   * stock—, y sin esta condición la pantalla de «carrito vacío» cortaba el
   * render antes de llegar al diálogo del código de pago: el cliente pagaba a
   * ciegas o no pagaba.
   */
  if (lineas.length === 0 && !cobro) {
    return (
      <EstadoVacio
        icono={<ShoppingBasket className="size-6" aria-hidden />}
        titulo="Su carrito está vacío"
        descripcion="Agregue platos del catálogo y vuelva aquí para confirmar el pedido."
        accion={
          <Link href="/portal">
            <Boton variante="primario" icono={<ArrowLeft className="size-4" aria-hidden />}>
              Ir al catálogo
            </Boton>
          </Link>
        }
      />
    );
  }

  return (
    <>
      <header className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-tinta">
          {paso === 'carrito' ? 'Su pedido' : 'Entrega y pago'}
        </h1>
        <div className="mt-3 flex items-center gap-2">
          <Indicador activo numero={1} etiqueta="Carrito" />
          <span className="h-px w-8 bg-borde" aria-hidden />
          <Indicador activo={paso === 'entrega'} numero={2} etiqueta="Entrega" />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <AnimatePresence mode="wait">
          {paso === 'carrito' ? (
            <motion.ul
              key="carrito"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="space-y-2.5"
            >
              <AnimatePresence mode="popLayout">
                {lineas.map((linea) => (
                  <motion.li
                    key={linea.idProducto}
                    layout
                    exit={{ opacity: 0, height: 0 }}
                    className="superficie-tarjeta flex items-center gap-4 rounded-2xl p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-tinta">{linea.nombre}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-tinta-tenue">
                        {formatearBs(linea.precio)} c/u
                      </p>
                    </div>

                    <div className="flex items-center gap-1 rounded-xl border border-borde p-1">
                      <BotonCantidad
                        etiqueta="Quitar una unidad"
                        onClick={() => cambiarCantidad(linea.idProducto, linea.cantidad - 1)}
                      >
                        <Minus className="size-3.5" aria-hidden />
                      </BotonCantidad>
                      <span className="w-7 text-center text-sm tabular-nums text-tinta">
                        {linea.cantidad}
                      </span>
                      <BotonCantidad
                        etiqueta="Agregar una unidad"
                        deshabilitado={linea.cantidad >= linea.stockDisponible}
                        onClick={() => cambiarCantidad(linea.idProducto, linea.cantidad + 1)}
                      >
                        <Plus className="size-3.5" aria-hidden />
                      </BotonCantidad>
                    </div>

                    <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-tinta">
                      {formatearBs(linea.precio * linea.cantidad)}
                    </span>

                    <Tooltip texto="Quitar del carrito">
                      <Boton
                        tamano="icono"
                        variante="fantasma"
                        aria-label={`Quitar ${linea.nombre}`}
                        onClick={() => quitar(linea.idProducto)}
                        className="hover:bg-peligro/15 hover:text-peligro"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Boton>
                    </Tooltip>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          ) : (
            <motion.form
              key="entrega"
              id="formulario-pedido"
              onSubmit={confirmar}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="space-y-6"
            >
              <section className="superficie-tarjeta rounded-2xl p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-tinta">
                  <MapPin className="size-4 text-marca-400" aria-hidden />
                  ¿Dónde lo entregamos?
                </h2>

                {/* CU-PED-03: sus direcciones guardadas, con la primera ya
                    elegida. Quien vuelve no reescribe nada. */}
                <SelectorDireccion onCambiar={setDestino} />
              </section>

              <section className="superficie-tarjeta rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-medium text-tinta">Método de pago</h2>

                <div className="grid gap-2 sm:grid-cols-3">
                  {METODOS.map((metodo) => {
                    const Icono = metodo.icono;
                    const elegido = metodoPago === metodo.valor;

                    return (
                      <button
                        key={metodo.valor}
                        type="button"
                        onClick={() => setMetodoPago(metodo.valor)}
                        className={cn(
                          'relative rounded-xl border p-3.5 text-left transition-colors duration-200',
                          elegido
                            ? 'border-marca-500/50 bg-marca-500/10'
                            : 'border-borde hover:border-borde-fuerte',
                        )}
                      >
                        <Icono
                          className={cn(
                            'size-5',
                            elegido ? 'text-marca-400' : 'text-tinta-tenue',
                          )}
                          aria-hidden
                        />
                        <p
                          className={cn(
                            'mt-2 text-sm',
                            elegido ? 'text-marca-300' : 'text-tinta',
                          )}
                        >
                          {metodo.etiqueta}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-tinta-tenue">
                          {metodo.ayuda}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {pagoEnLinea && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden text-xs leading-relaxed text-tinta-tenue"
                    >
                      <span className="block pt-4">
                        Al confirmar se mostrará el código de pago con el monto ya cargado. El
                        pedido entra a la cocina cuando el pago se acredita.
                      </span>
                    </motion.p>
                  )}
                </AnimatePresence>
              </section>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-peligro/25 bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro"
                >
                  {error}
                </p>
              )}
            </motion.form>
          )}
        </AnimatePresence>

        <aside className="superficie-tarjeta sticky top-24 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-tinta">Resumen</h2>

          <ul className="mt-4 space-y-2 border-b border-borde pb-4">
            {lineas.map((linea) => (
              <li key={linea.idProducto} className="flex justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-tinta-suave">
                  {linea.cantidad} × {linea.nombre}
                </span>
                <span className="shrink-0 tabular-nums text-tinta">
                  {formatearBs(linea.precio * linea.cantidad)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-tinta-suave">Total</span>
            <span className="text-xl font-semibold tabular-nums text-marca-300">
              {formatearBs(importeTotal)}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-tinta-tenue">
            El importe definitivo lo calcula el sistema con el precio vigente al confirmar.
          </p>

          <div className="mt-5 space-y-2">
            {paso === 'carrito' ? (
              <Boton
                variante="primario"
                tamano="lg"
                className="w-full justify-center"
                onClick={() => setPaso('entrega')}
              >
                Continuar
                <ArrowRight className="size-4" aria-hidden />
              </Boton>
            ) : (
              <>
                <Boton
                  type="submit"
                  form="formulario-pedido"
                  variante="primario"
                  tamano="lg"
                  cargando={enviando}
                  /* Sin dirección resuelta no hay a dónde entregar. */
                  disabled={destino === null}
                  className="w-full justify-center"
                >
                  Confirmar pedido
                </Boton>
                <Boton
                  variante="fantasma"
                  className="w-full justify-center"
                  onClick={() => setPaso('carrito')}
                  icono={<ArrowLeft className="size-4" aria-hidden />}
                >
                  Volver al carrito
                </Boton>
              </>
            )}
          </div>
        </aside>
      </div>

      <DialogoCobro
        pago={cobro}
        onCerrar={() => {
          // Se cierre como se cierre, el pedido ya existe: el cliente lo
          // encuentra en su listado, pagado o esperando pago.
          setCobro(null);
          router.push('/portal/pedidos');
        }}
        onPagado={() => notificar('exito', 'Pago acreditado. Su pedido entró a preparación')}
      />
    </>
  );
}

function Indicador({
  activo,
  numero,
  etiqueta,
}: {
  activo: boolean;
  numero: number;
  etiqueta: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={cn(
          'grid size-6 place-items-center rounded-full border text-[11px] font-semibold transition-colors',
          activo
            ? 'border-marca-500 bg-marca-500 text-sobre-marca'
            : 'border-borde text-tinta-tenue',
        )}
      >
        {numero}
      </span>
      <span className={cn('text-xs', activo ? 'text-tinta' : 'text-tinta-tenue')}>{etiqueta}</span>
    </span>
  );
}

function BotonCantidad({
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
      whileTap={{ scale: 0.88 }}
      className="grid size-7 place-items-center rounded-lg text-tinta-suave transition-colors hover:bg-white/[0.06] hover:text-tinta disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </motion.button>
  );
}
