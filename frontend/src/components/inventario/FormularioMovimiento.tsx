'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Campo, AreaTexto } from '@/components/ui/Campo';
import { Selector } from '@/components/ui/Selector';
import { Boton } from '@/components/ui/Boton';
import { EditorLineas, lineaVacia, type ItemMovible, type Linea } from './EditorLineas';
import { api, ErrorApi } from '@/lib/api';
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

  useEffect(() => {
    // Un egreso por merma o ajuste debe poder vaciar del almacén un ítem ya
    // dado de baja, así que ahí sí se ofrecen los inactivos. Un ingreso de algo
    // dado de baja contradice la baja, y el servidor lo rechaza.
    const sufijo = esIngreso ? '' : '?incluirInactivos=true';

    Promise.all([
      api.get<Insumo[]>(`/insumos${sufijo}`),
      api.get<Producto[]>(`/productos${sufijo}`),
      api.get<Almacen[]>('/almacenes'),
    ])
      .then(([listaInsumos, listaProductos, listaAlmacenes]) => {
        setItems([
          ...listaInsumos.map<ItemMovible>((i) => ({
            clave: `insumo:${i.id}`,
            tipo: 'insumo',
            id: i.id,
            nombre: i.activo ? i.nombre : `${i.nombre} (dado de baja)`,
            unidad: i.unidad.abreviatura,
            costoSugerido: i.costoUnitario,
            controlaVencimiento: i.controlaVencimiento,
          })),
          ...listaProductos.map<ItemMovible>((p) => ({
            clave: `producto:${p.id}`,
            tipo: 'producto',
            id: p.id,
            nombre: p.activo ? p.nombre : `${p.nombre} (dado de baja)`,
            unidad: 'u',
            costoSugerido: p.precio,
            controlaVencimiento: false,
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

  const completas = lineas.filter(
    (l) => l.clave && l.idAlmacen !== null && Number(l.cantidad) > 0,
  );

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    if (completas.length === 0) {
      setError('Complete al menos una línea con ítem, almacén y cantidad');
      return;
    }

    const porClave = new Map(items.map((i) => [i.clave, i]));

    const insumos = completas
      .filter((l) => porClave.get(l.clave!)?.tipo === 'insumo')
      .map((l) => ({
        idIngrediente: porClave.get(l.clave!)!.id,
        idAlmacen: l.idAlmacen!,
        cantidad: Number(l.cantidad),
        ...(esIngreso
          ? {
              costoUnitario: Number(l.costoUnitario || 0),
              ...(l.codigoLote.trim() ? { codigoLote: l.codigoLote.trim() } : {}),
              ...(l.fechaVencimiento ? { fechaVencimiento: l.fechaVencimiento } : {}),
            }
          : {}),
      }));

    const productos = completas
      .filter((l) => porClave.get(l.clave!)?.tipo === 'producto')
      .map((l) => ({
        idProducto: porClave.get(l.clave!)!.id,
        idAlmacen: l.idAlmacen!,
        cantidad: Number(l.cantidad),
        ...(esIngreso ? { costoUnitario: Number(l.costoUnitario || 0) } : {}),
      }));

    setEnviando(true);
    try {
      if (esIngreso) {
        await api.post('/ingresos', {
          motivo,
          proveedor: proveedor.trim() || null,
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

  return (
    <form onSubmit={enviar} className="space-y-5">
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

      {esIngreso ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Proveedor"
            maxLength={150}
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            ayuda="Opcional"
          />
          <Campo
            etiqueta="Número de documento"
            maxLength={50}
            value={numeroDocumento}
            onChange={(e) => setNumeroDocumento(e.target.value)}
            ayuda="Factura o comprobante"
          />
        </div>
      ) : (
        <AreaTexto
          etiqueta="Observación"
          maxLength={200}
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          placeholder="Motivo detallado de la salida"
          ayuda="Opcional, pero recomendable para auditar la merma"
        />
      )}

      <EditorLineas
        lineas={lineas}
        items={items}
        almacenes={almacenes}
        conCosto={esIngreso}
        onCambiar={setLineas}
      />

      {!esIngreso && (
        <p className="flex items-start gap-2 rounded-xl border border-borde bg-white/[0.02] px-3.5 py-2.5 text-xs text-tinta-tenue">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          El sistema verifica las existencias antes de descontar. Si alguna cantidad supera lo
          disponible, la nota completa se rechaza y ningún stock se modifica.
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
