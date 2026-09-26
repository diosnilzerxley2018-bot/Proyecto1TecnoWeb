'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowUpRight, Factory } from 'lucide-react';
import { Campo, AreaTexto } from '@/components/ui/Campo';
import { Selector } from '@/components/ui/Selector';
import { Boton } from '@/components/ui/Boton';
import {
  EditorLineas,
  enBlanco,
  lineaVacia,
  revisarLineas,
  type ItemMovible,
  type Linea,
} from './EditorLineas';
import { api, ErrorApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import {
  AYUDA_MOTIVO,
  ETIQUETA_MOTIVO,
  MOTIVOS_EGRESO,
  MOTIVOS_INGRESO,
} from '@/lib/inventario';
import type { Almacen, Insumo, Producto, ResultadoEgreso } from '@/types';
import { formatearCantidad } from '@/lib/formato';

export type Direccion = 'ingreso' | 'egreso';

/** Qué documento respalda un ingreso, según su motivo. */
const AYUDA_DOCUMENTO: Record<string, string> = {
  Compra: 'Factura o comprobante',
  Devolucion: 'Comprobante de la devolución, si lo hay',
  Ajuste: 'Acta o planilla del recuento, si la hay',
  Produccion: 'Opcional',
};

/** Qué conviene anotar en un egreso, según su motivo. */
const OBSERVACION_EGRESO: Record<string, { marcador: string; ayuda: string }> = {
  Merma: {
    marcador: 'Qué pasó: se venció, se rompió, se derramó…',
    ayuda: 'Opcional, pero explica la pérdida a quien revise el inventario',
  },
  Ajuste: {
    marcador: 'Por qué no coincidía: recuento, error de carga…',
    ayuda: 'Opcional, pero explica la diferencia a quien revise el inventario',
  },
  Produccion: { marcador: 'Qué se elaboró', ayuda: 'Opcional' },
};

/**
 * Registro de una nota de ingreso o de egreso (CU-INV-03 y CU-INV-04).
 *
 * Las dos notas comparten estructura —cabecera más detalle de insumos y
 * productos—, y se diferencian en tres cosas: los motivos admitidos, si las
 * líneas llevan costo y qué campo describe la nota. Un solo formulario
 * parametrizado evita duplicar el editor de líneas, que es lo caro.
 */
export function FormularioMovimiento({
  direccion,
  onListo,
  onCancelar,
}: {
  direccion: Direccion;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const { tienePermiso } = useAuth();
  const { notificar } = useNotificaciones();
  const esIngreso = direccion === 'ingreso';

  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [items, setItems] = useState<ItemMovible[]>([]);
  const [cargandoDatos, setCargandoDatos] = useState(true);

  const [motivo, setMotivo] = useState<string>(esIngreso ? 'Compra' : 'Merma');
  const [proveedor, setProveedor] = useState('');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [observacion, setObservacion] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Las líneas incompletas se señalan recién después del primer intento. */
  const [intentado, setIntentado] = useState(false);
  /** Productos cuyo costo ya se pidió a la ficha, para no repetir la consulta. */
  const costosPedidos = useRef(new Set<string>());

  useEffect(() => {
    // Un egreso por merma o ajuste debe poder vaciar del almacén un ítem ya
    // dado de baja, así que ahí sí se ofrecen los inactivos. Un ingreso de algo
    // dado de baja contradice la baja, y el servidor lo rechaza.
    const sufijo = esIngreso ? '' : '?incluirInactivos=true';
    // En un egreso, lo dado de baja solo interesa si todavía queda algo que sacar.
    const sirve = (i: { activo: boolean; stockTotal: number }) =>
      esIngreso || i.activo || i.stockTotal > 0;
    const existencias = (i: Insumo | Producto) =>
      i.existencias.map((e) => ({ idAlmacen: e.idAlmacen, stock: e.stock }));

    Promise.all([
      api.get<Insumo[]>(`/insumos${sufijo}`),
      api.get<Producto[]>(`/productos${sufijo}`),
      api.get<Almacen[]>('/almacenes'),
    ])
      .then(([listaInsumos, listaProductos, listaAlmacenes]) => {
        setItems([
          ...listaInsumos.filter(sirve).map<ItemMovible>((i) => ({
            clave: `insumo:${i.id}`,
            tipo: 'insumo',
            id: i.id,
            nombre: i.activo ? i.nombre : `${i.nombre} (dado de baja)`,
            unidad: i.unidad.abreviatura,
            nombreUnidad: i.unidad.nombre.toLowerCase(),
            costoSugerido: i.costoUnitario,
            costoPendiente: false,
            controlaVencimiento: i.controlaVencimiento,
            tipoConservacion: i.tipoConservacion,
            existencias: existencias(i),
          })),
          ...listaProductos.filter(sirve).map<ItemMovible>((p) => ({
            clave: `producto:${p.id}`,
            tipo: 'producto',
            id: p.id,
            nombre: p.activo ? p.nombre : `${p.nombre} (dado de baja)`,
            unidad: 'u',
            nombreUnidad: 'unidad',
            // Nunca `p.precio`: es el de venta. El costo se pide a la ficha.
            costoSugerido: null,
            costoPendiente: true,
            controlaVencimiento: false,
            tipoConservacion: p.tipoConservacion,
            existencias: existencias(p),
          })),
        ]);
        setAlmacenes(listaAlmacenes);
      })
      .catch(() => notificar('error', 'No se pudieron cargar los insumos, productos y almacenes'))
      .finally(() => setCargandoDatos(false));
  }, [esIngreso, notificar]);

  const motivos = useMemo(
    () => (esIngreso ? MOTIVOS_INGRESO : MOTIVOS_EGRESO),
    [esIngreso],
  );

  /**
   * El costo promedio del producto, para prellenar su línea.
   *
   * Sale de sus notas de ingreso (`producto.costoPromedio`), así que proponer
   * el precio de venta —como se hacía— lo iba arrastrando hacia ese precio y
   * el margen se leía en cero. Solo se completa si nadie escribió otro.
   */
  function alElegir(item: ItemMovible) {
    if (!esIngreso || !item.costoPendiente || costosPedidos.current.has(item.clave)) return;
    costosPedidos.current.add(item.clave);

    const fijar = (costo: number | null) => {
      setItems((actuales) =>
        actuales.map((i) =>
          i.clave === item.clave ? { ...i, costoSugerido: costo, costoPendiente: false } : i,
        ),
      );
      if (costo !== null) {
        setLineas((actuales) =>
          actuales.map((l) =>
            l.clave === item.clave && l.costoUnitario === ''
              ? { ...l, costoUnitario: String(costo) }
              : l,
          ),
        );
      }
    };

    api
      .get<Producto>(`/productos/${item.id}`)
      .then((ficha) => fijar(ficha.costoPromedio))
      .catch(() => fijar(null));
  }

  const problemas = intentado ? revisarLineas(lineas, items, almacenes, esIngreso) : null;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setIntentado(true);

    const llenas = lineas.filter((l) => !enBlanco(l));
    if (llenas.length === 0) {
      setError('Agregue al menos un insumo o producto, con su almacén y cantidad');
      return;
    }

    // Una línea a medio llenar ya no se descarta en silencio: se señala.
    const pendientes = revisarLineas(lineas, items, almacenes, esIngreso).size;
    if (pendientes > 0) {
      setError(
        pendientes === 1
          ? 'Revise la línea marcada arriba'
          : `Revise las ${pendientes} líneas marcadas arriba`,
      );
      return;
    }

    const porClave = new Map(items.map((i) => [i.clave, i]));

    const insumos = llenas
      .filter((l) => porClave.get(l.clave!)?.tipo === 'insumo')
      .map((l) => ({
        idIngrediente: porClave.get(l.clave!)!.id,
        idAlmacen: l.idAlmacen!,
        cantidad: Number(l.cantidad),
        ...(esIngreso
          ? {
              costoUnitario: Number(l.costoUnitario),
              ...(l.codigoLote.trim() ? { codigoLote: l.codigoLote.trim() } : {}),
              ...(l.fechaVencimiento ? { fechaVencimiento: l.fechaVencimiento } : {}),
            }
          : {}),
      }));

    const productos = llenas
      .filter((l) => porClave.get(l.clave!)?.tipo === 'producto')
      .map((l) => ({
        idProducto: porClave.get(l.clave!)!.id,
        idAlmacen: l.idAlmacen!,
        cantidad: Number(l.cantidad),
        ...(esIngreso ? { costoUnitario: Number(l.costoUnitario) } : {}),
      }));

    setEnviando(true);
    try {
      if (esIngreso) {
        await api.post('/ingresos', {
          motivo,
          // El proveedor solo existe en una compra; lo escrito antes de cambiar
          // de motivo no viaja.
          proveedor: motivo === 'Compra' ? proveedor.trim() || null : null,
          numeroDocumento: numeroDocumento.trim() || null,
          insumos,
          productos,
        });
        notificar('exito', 'Nota de ingreso registrada, stock actualizado');
      } else {
        const resultado = await api.post<ResultadoEgreso>('/egresos', {
          motivo,
          observacion: observacion.trim() || null,
          insumos,
          productos,
        });
        notificar('exito', 'Nota de egreso registrada, stock descontado');

        // CU-INV-04: tras descontar, el sistema avisa qué insumos alcanzaron su mínimo.
        for (const alerta of resultado.alertas) {
          notificar(
            'info',
            `${alerta.nombre} alcanzó su stock mínimo: quedan ${formatearCantidad(alerta.stockTotal)} ${alerta.unidad}`,
          );
        }
      }
      onListo();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo registrar la nota');
    } finally {
      setEnviando(false);
    }
  }

  if (cargandoDatos) {
    return <p className="py-8 text-center text-sm text-tinta-tenue">Cargando catálogos…</p>;
  }

  const observacionSegunMotivo = OBSERVACION_EGRESO[motivo] ?? OBSERVACION_EGRESO.Merma;

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <Selector<string>
        etiqueta="Motivo"
        valor={motivo}
        onCambiar={setMotivo}
        ayuda={AYUDA_MOTIVO[motivo]}
        opciones={motivos.map((m) => ({
          valor: m,
          etiqueta: ETIQUETA_MOTIVO[m],
          descripcion: AYUDA_MOTIVO[m],
        }))}
      />

      {/*
        El informe admite el motivo Producción en una nota manual, pero lo
        elaborado con una orden ya movió el stock al finalizarla (RF-PRO-07).
        Cargarlo aquí también lo contaría dos veces, y el reporte de producción
        no vería esa elaboración: se avisa y se ofrece el camino correcto.
      */}
      {motivo === 'Produccion' && (
        <div className="flex items-start gap-2.5 rounded-xl border border-aviso/30 bg-aviso/[0.06] px-3.5 py-3 text-xs leading-relaxed text-tinta-suave">
          <Factory className="mt-0.5 size-4 shrink-0 text-aviso" aria-hidden />
          <div>
            <p>
              Lo elaborado con una <strong className="text-tinta">orden de producción</strong> ya
              movió el stock al finalizarla: la orden descuenta los insumos e ingresa el producto.
              Use este motivo solo para lo producido sin orden, o se contará dos veces.
            </p>
            {tienePermiso('ORDEN_PRODUCCION_GESTIONAR') && (
              <Link
                href="/produccion/ordenes"
                className="mt-1.5 inline-flex items-center gap-1 font-medium text-marca-300 hover:text-marca-400"
              >
                Ir a Órdenes de producción
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      )}

      {esIngreso ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {motivo === 'Compra' && (
            <Campo
              etiqueta="Proveedor"
              maxLength={150}
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              ayuda="Opcional"
            />
          )}
          <Campo
            etiqueta="Número de documento"
            maxLength={50}
            value={numeroDocumento}
            onChange={(e) => setNumeroDocumento(e.target.value)}
            ayuda={AYUDA_DOCUMENTO[motivo]}
          />
        </div>
      ) : (
        <AreaTexto
          etiqueta="Observación"
          maxLength={200}
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          placeholder={observacionSegunMotivo.marcador}
          ayuda={observacionSegunMotivo.ayuda}
        />
      )}

      <EditorLineas
        lineas={lineas}
        items={items}
        almacenes={almacenes}
        esIngreso={esIngreso}
        esCompra={motivo === 'Compra'}
        problemas={problemas}
        onCambiar={setLineas}
        onItemElegido={alElegir}
      />

      {!esIngreso && (
        <p className="flex items-start gap-2 rounded-xl border border-borde bg-white/[0.02] px-3.5 py-2.5 text-xs text-tinta-tenue">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Cada almacén muestra cuánto hay. El sistema vuelve a verificarlo al registrar: si
          alguna cantidad supera lo disponible, la nota completa se rechaza y ningún stock se
          modifica.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="fantasma" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" variante="primario" cargando={enviando}>
          Registrar {esIngreso ? 'ingreso' : 'egreso'}
        </Boton>
      </div>
    </form>
  );
}
