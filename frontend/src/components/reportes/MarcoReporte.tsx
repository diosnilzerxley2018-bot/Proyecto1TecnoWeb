'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChartColumn, FileText, Mail, Send } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { Campo } from '@/components/ui/Campo';
import { Boton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/Dialogo';

/**
 * El armazón común a los cuatro reportes del sistema (RF-VEN-07, RF-PED-10,
 * RF-PRO-08 y RF-INV-08).
 *
 * Los cuatro se manejan igual: se elige un rango, se consulta, se mira en
 * pantalla y se saca en PDF o por correo. Solo cambia **qué** se mide, y eso
 * es lo único que cada pantalla escribe.
 *
 * Sin esto habría cuatro copias del mismo rango de fechas, el mismo botón de
 * PDF y el mismo diálogo de correo, y arreglar el manejo de un error obligaría
 * a arreglarlo cuatro veces.
 */

/** Filtros propios de cada reporte, además del rango. */
export type FiltrosReporte = Record<string, string | number | undefined>;

interface Props<R> {
  titulo: string;
  descripcion: string;
  /** Recurso en la API: `ventas`, `pedidos`, `produccion`, `inventario`. */
  recurso: string;
  filtros?: FiltrosReporte;
  /** Controles propios, dibujados junto a las fechas. */
  controles?: ReactNode;
  /** Si el reporte no tiene nada que mostrar en el período. */
  vacio: (reporte: R) => boolean;
  tituloVacio: string;
  /** Lo que se dibuja cuando sí hay datos. */
  children: (reporte: R) => ReactNode;
}

/** El mes en curso, que es el período que se consulta por omisión. */
function mesEnCurso(): { desde: string; hasta: string } {
  const hoy = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) };
}

export function MarcoReporte<R>({
  titulo,
  descripcion,
  recurso,
  filtros,
  controles,
  vacio,
  tituloVacio,
  children,
}: Props<R>) {
  const { notificar } = useNotificaciones();
  const inicial = mesEnCurso();

  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);

  const [reporte, setReporte] = useState<R | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [dialogoCorreo, setDialogoCorreo] = useState(false);
  const [destino, setDestino] = useState('');

  // Los filtros llegan como objeto nuevo en cada dibujo; se comparan por su
  // contenido para que la consulta se repita cuando cambian de verdad y no en
  // cada render.
  const claveFiltros = JSON.stringify(filtros ?? {});

  const parametros = useCallback(() => {
    const p = new URLSearchParams({ desde, hasta });
    for (const [clave, valor] of Object.entries(
      JSON.parse(claveFiltros) as FiltrosReporte,
    )) {
      if (valor !== undefined && valor !== '') p.set(clave, String(valor));
    }
    return p.toString();
  }, [desde, hasta, claveFiltros]);

  const consultar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setReporte(await api.get<R>(`/reportes/${recurso}?${parametros()}`));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo generar el reporte');
      setReporte(null);
    } finally {
      setCargando(false);
    }
  }, [recurso, parametros]);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  /** Abre el PDF en una pestaña. El objeto se libera al minuto. */
  async function verPdf() {
    setDescargando(true);
    try {
      const blob = await api.descargar(`/reportes/${recurso}.pdf?${parametros()}`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo generar el PDF');
    } finally {
      setDescargando(false);
    }
  }

  async function enviarPorCorreo() {
    setEnviando(true);
    try {
      const r = await api.post<{ enviado: boolean; motivo?: string }>(
        `/reportes/${recurso}/enviar`,
        {
          desde,
          hasta,
          ...(JSON.parse(claveFiltros) as FiltrosReporte),
          para: destino.trim(),
        },
      );

      if (r.enviado) {
        notificar('exito', `Reporte enviado a ${destino.trim()}`);
        setDialogoCorreo(false);
        setDestino('');
      } else {
        // Que el correo no salga no invalida el reporte: se dice qué pasó y la
        // pantalla sigue mostrando lo consultado.
        notificar('error', r.motivo ?? 'El servidor de correo no aceptó el mensaje');
      }
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo enviar el reporte');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <EncabezadoPagina titulo={titulo} descripcion={descripcion} />

      <section className="superficie-tarjeta mb-5 rounded-2xl p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_minmax(0,1.4fr)]">
          <Campo
            etiqueta="Desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
          <Campo
            etiqueta="Hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
          {controles}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-borde pt-4">
          <Boton
            variante="contorno"
            cargando={descargando}
            disabled={!reporte}
            onClick={verPdf}
            icono={<FileText className="size-4" aria-hidden />}
          >
            Ver en PDF
          </Boton>
          <Boton
            variante="primario"
            disabled={!reporte}
            onClick={() => setDialogoCorreo(true)}
            icono={<Mail className="size-4" aria-hidden />}
          >
            Enviar por correo
          </Boton>
        </div>
      </section>

      {cargando ? (
        <EsqueletoFilas filas={4} alto="h-20" />
      ) : error ? (
        <p role="alert" className="rounded-2xl bg-peligro/10 px-5 py-4 text-sm text-peligro">
          {error}
        </p>
      ) : !reporte || vacio(reporte) ? (
        <EstadoVacio
          icono={<ChartColumn className="size-6" aria-hidden />}
          titulo={tituloVacio}
          descripcion="Pruebe con otro rango de fechas o quite los filtros."
        />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${desde}-${hasta}-${claveFiltros}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {children(reporte)}
          </motion.div>
        </AnimatePresence>
      )}

      <Dialogo
        abierto={dialogoCorreo}
        onCerrar={() => setDialogoCorreo(false)}
        titulo="Enviar el reporte"
        descripcion={`${titulo}, del ${desde} al ${hasta}`}
        ancho="max-w-md"
      >
        <div className="space-y-4">
          <Campo
            etiqueta="Correo del destinatario"
            type="email"
            required
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="gerencia@tecnologia.web"
            ayuda="El reporte va adjunto en PDF"
          />

          <div className="flex justify-end gap-2">
            <Boton variante="fantasma" onClick={() => setDialogoCorreo(false)}>
              Cancelar
            </Boton>
            <Boton
              variante="primario"
              cargando={enviando}
              disabled={!destino.includes('@')}
              onClick={enviarPorCorreo}
              icono={<Send className="size-4" aria-hidden />}
            >
              Enviar
            </Boton>
          </div>
        </div>
      </Dialogo>
    </>
  );
}
