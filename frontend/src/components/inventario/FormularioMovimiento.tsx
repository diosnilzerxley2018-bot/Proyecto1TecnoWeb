'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
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
import {
  claveVinculada,
  LineasVinculadas,
  revisarVinculadas,
  valoresIniciales,
  type ValorVinculado,
} from './LineasVinculadas';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import {
  AYUDA_MOTIVO_EGRESO,
  AYUDA_MOTIVO_INGRESO,
  ETIQUETA_MOTIVO,
  MOTIVO_SOLO_PRODUCTOS,
  MOTIVOS_EGRESO_MANUAL,
  MOTIVOS_INGRESO_MANUAL,
  numeroDeEgreso,
  numeroDeIngreso,
} from '@/lib/inventario';
import type {
  Almacen,
  DocumentoVinculable,
  Insumo,
  Producto,
  ResultadoEgreso,
} from '@/types';
import { formatearCantidad, formatearFecha } from '@/lib/formato';

export type Direccion = 'ingreso' | 'egreso';

/** Qué documento respalda un ingreso, según su motivo. */
const AYUDA_DOCUMENTO: Record<string, string> = {
  Compra: 'Factura o comprobante',
  Reposicion: 'Nota o guía del proveedor, si la hay',
  Devolucion: 'Comprobante de la devolución, si lo hay',
  Ajuste: 'Acta o planilla del recuento, si la hay',
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
  Devolucion: {
    marcador: 'A qué proveedor y por qué: vencido, dañado, equivocado…',
    ayuda: 'Lo que el proveedor reponga se registra después como ingreso por Reposición',
  },
};

/** El proveedor se anota en lo que viene de él: una compra o su reposición. */
const CON_PROVEEDOR = new Set(['Compra', 'Reposicion']);

/**
 * Registro de una nota de ingreso o de egreso (CU-INV-03 y CU-INV-04).
 *
 * Las dos notas comparten estructura —cabecera más detalle de insumos y
 * productos—, y se diferencian en tres cosas: los motivos admitidos, si las
 * líneas llevan costo y qué campo describe la nota. Un solo formulario
 * parametrizado evita duplicar el editor de líneas, que es lo caro.
 *
 * El motivo Producción no se ofrece: lo escribe la orden de producción al
 * finalizarse (RF-PRO-07), y cargarlo aquí también lo contaba dos veces.
 *
 * Compra → Devolución → Reposición: una devolución al proveedor sale de una
 * compra, y una reposición repone una devolución. Con esos dos motivos no se
 * eligen ítems sueltos: se elige el documento —con buscador, porque pueden ser
 * muchos— y se indica cuánto de cada línea (`LineasVinculadas`). El servidor
 * comprueba lo mismo y pone el precio de la reposición.
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

  /** Una devolución al proveedor o una reposición: van atadas a un documento. */
  const vinculada = esIngreso ? motivo === 'Reposicion' : motivo === 'Devolucion';
  const [documentos, setDocumentos] = useState<DocumentoVinculable[] | null>(null);
  const [idDocumento, setIdDocumento] = useState<number | null>(null);
  const [valoresVinculados, setValoresVinculados] = useState<Record<string, ValorVinculado>>({});
  const documento = documentos?.find((d) => d.id === idDocumento) ?? null;

  // Las compras que pueden devolverse, o las devoluciones por reponer: se
  // piden la primera vez que se elige el motivo.
  useEffect(() => {
    if (!vinculada || documentos !== null) return;
    api
      .get<DocumentoVinculable[]>(esIngreso ? '/egresos/reponibles' : '/ingresos/devolubles')
      .then(setDocumentos)
      .catch(() => {
        setDocumentos([]);
        notificar(
          'error',
          esIngreso
            ? 'No se pudieron cargar las devoluciones por reponer'
            : 'No se pudieron cargar las compras',
        );
      });
  }, [vinculada, documentos, esIngreso, notificar]);

  function elegirDocumento(id: number) {
    const elegido = documentos?.find((d) => d.id === id);
    if (!elegido) return;
    setIdDocumento(id);
    setValoresVinculados(valoresIniciales(elegido, esIngreso));
    // Repone el mismo proveedor al que se le devolvió.
    if (esIngreso && !proveedor.trim() && elegido.proveedor) setProveedor(elegido.proveedor);
  }

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
            // Sin compras todavía no tiene costo: no se propone un cero.
            costoSugerido: i.costoUnitario > 0 ? i.costoUnitario : null,
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
    () => (esIngreso ? MOTIVOS_INGRESO_MANUAL : MOTIVOS_EGRESO_MANUAL),
    [esIngreso],
  );
  const ayudaMotivo = esIngreso ? AYUDA_MOTIVO_INGRESO : AYUDA_MOTIVO_EGRESO;
  /** Lo que vuelve en una devolución es lo que se entregó: un producto terminado. */
  const soloProductos = esIngreso && motivo === MOTIVO_SOLO_PRODUCTOS;

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

  const problemas = intentado
    ? revisarLineas(lineas, items, almacenes, esIngreso, soloProductos)
    : null;
  const problemasVinculados =
    intentado && documento ? revisarVinculadas(documento, valoresVinculados, esIngreso) : null;

  /** CU-INV-04: tras descontar, el sistema avisa qué insumos alcanzaron su mínimo. */
  function avisarAlertas(resultado: ResultadoEgreso) {
    for (const alerta of resultado.alertas) {
      notificar(
        'info',
        `${alerta.nombre} alcanzó su stock mínimo: quedan ${formatearCantidad(alerta.stockTotal)} ${alerta.unidad}`,
      );
    }
  }

  async function enviarVinculada() {
    if (!documento) {
      setError(esIngreso ? 'Elija la devolución que se repone' : 'Elija la compra que se devuelve');
      return;
    }
    const pendientes = revisarVinculadas(documento, valoresVinculados, esIngreso).size;
    if (pendientes > 0) {
      setError(
        pendientes === 1
          ? 'Revise la línea marcada arriba'
          : `Revise las ${pendientes} líneas marcadas arriba`,
      );
      return;
    }
    const valorDe = (l: DocumentoVinculable['lineas'][number]) =>
      valoresVinculados[claveVinculada(l)];
    const elegidas = documento.lineas.filter((l) => Number(valorDe(l)?.cantidad || 0) > 0);
    if (elegidas.length === 0) {
      setError(
        esIngreso ? 'Indique cuánto se repone' : 'Indique cuánto se devuelve de al menos un ítem',
      );
      return;
    }

    const insumos = elegidas
      .filter((l) => l.tipo === 'insumo')
      .map((l) => {
        const valor = valorDe(l);
        return {
          idIngrediente: l.id,
          idAlmacen: l.idAlmacen,
          cantidad: Number(valor.cantidad),
          ...(esIngreso
            ? {
                // El servidor lo pone igual: es el precio de la compra.
                costoUnitario: l.costoUnitario,
                ...(valor.codigoLote.trim() ? { codigoLote: valor.codigoLote.trim() } : {}),
                ...(valor.fechaVencimiento ? { fechaVencimiento: valor.fechaVencimiento } : {}),
              }
            : {}),
        };
      });
    const productos = elegidas
      .filter((l) => l.tipo === 'producto')
      .map((l) => ({
        idProducto: l.id,
        idAlmacen: l.idAlmacen,
        cantidad: Number(valorDe(l).cantidad),
        ...(esIngreso ? { costoUnitario: l.costoUnitario } : {}),
      }));

    setEnviando(true);
    try {
      if (esIngreso) {
        await api.post('/ingresos', {
          motivo,
          proveedor: proveedor.trim() || null,
          numeroDocumento: numeroDocumento.trim() || null,
          idNotaEgreso: documento.id,
          insumos,
          productos,
        });
        notificar('exito', `Reposición registrada: repone ${numeroDeEgreso(documento.id)}`);
      } else {
        const resultado = await api.post<ResultadoEgreso>('/egresos', {
          motivo,
          observacion: observacion.trim() || null,
          idNotaIngreso: documento.id,
          insumos,
          productos,
        });
        notificar(
          'exito',
          `Devolución registrada: sale de la compra ${numeroDeIngreso(documento.id)}`,
        );
        avisarAlertas(resultado);
      }
      onListo();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo registrar la nota');
    } finally {
      setEnviando(false);
    }
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setIntentado(true);
    if (vinculada) return enviarVinculada();

    const llenas = lineas.filter((l) => !enBlanco(l));
    if (llenas.length === 0) {
      setError('Agregue al menos un insumo o producto, con su almacén y cantidad');
      return;
    }

    // Una línea a medio llenar ya no se descarta en silencio: se señala.
    const pendientes = revisarLineas(lineas, items, almacenes, esIngreso, soloProductos).size;
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
          // El proveedor solo existe en lo que viene de él; lo escrito antes de
          // cambiar de motivo no viaja.
          proveedor: CON_PROVEEDOR.has(motivo) ? proveedor.trim() || null : null,
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
        avisarAlertas(resultado);
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
        ayuda={ayudaMotivo[motivo]}
        opciones={motivos.map((m) => ({
          valor: m,
          etiqueta: ETIQUETA_MOTIVO[m],
          descripcion: ayudaMotivo[m],
        }))}
      />

      {vinculada &&
        (documentos === null ? (
          <p className="text-sm text-tinta-tenue">
            {esIngreso ? 'Cargando las devoluciones…' : 'Cargando las compras…'}
          </p>
        ) : documentos.length === 0 ? (
          <p className="rounded-xl border border-aviso/30 bg-aviso/[0.06] px-3.5 py-3 text-xs leading-relaxed text-tinta-suave">
            {esIngreso
              ? 'No hay devoluciones por reponer. Primero se registra la devolución al proveedor, en una nota de egreso por Devolución.'
              : 'No hay compras con algo por devolver: todo lo comprado ya se devolvió.'}
          </p>
        ) : (
          <Selector<number>
            etiqueta={esIngreso ? 'Devolución que se repone' : 'Compra que se devuelve'}
            valor={idDocumento}
            onCambiar={elegirDocumento}
            buscable
            marcador={esIngreso ? 'Elija la devolución' : 'Elija la compra'}
            ayuda={
              esIngreso
                ? 'Se repone lo que salió en ella, al precio de la compra'
                : 'Se devuelve lo que entró en ella, del almacén donde entró'
            }
            opciones={documentos.map((d) => ({
              valor: d.id,
              etiqueta: [
                esIngreso ? numeroDeEgreso(d.id) : numeroDeIngreso(d.id),
                d.proveedor ?? 'sin proveedor',
              ].join(' · '),
              descripcion: [
                formatearFecha(d.fecha),
                d.idCompra ? `de la compra ${numeroDeIngreso(d.idCompra)}` : null,
                d.numeroDocumento,
                [...new Set(d.lineas.map((l) => l.nombre))].join(', '),
              ]
                .filter(Boolean)
                .join(' · '),
            }))}
          />
        ))}

      {esIngreso ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {CON_PROVEEDOR.has(motivo) && (
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

      {vinculada ? (
        documento && (
          <LineasVinculadas
            documento={documento}
            reponiendo={esIngreso}
            valores={valoresVinculados}
            problemas={problemasVinculados}
            onCambiar={(clave, cambios) =>
              setValoresVinculados((actuales) => ({
                ...actuales,
                [clave]: { ...actuales[clave], ...cambios },
              }))
            }
          />
        )
      ) : (
        <EditorLineas
          lineas={lineas}
          items={items}
          almacenes={almacenes}
          esIngreso={esIngreso}
          esCompra={motivo === 'Compra'}
          soloProductos={soloProductos}
          problemas={problemas}
          onCambiar={setLineas}
          onItemElegido={alElegir}
        />
      )}

      {!esIngreso && !vinculada && (
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
