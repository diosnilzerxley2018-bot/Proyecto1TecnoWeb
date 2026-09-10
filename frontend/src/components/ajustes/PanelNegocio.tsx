'use client';

import { useEffect, useState } from 'react';
import { Save, Store } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { Boton } from '@/components/ui/Boton';
import { Campo } from '@/components/ui/Campo';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { MapaUbicacion } from '@/components/pedidos/MapaUbicacion';
import type { Negocio } from '@/types';
import { formatearFecha } from '@/lib/formato';
import { redondearCoordenadas, type Coordenadas } from '@/lib/dominio';

/**
 * RF-PED-03 — información pública del negocio, editable por el administrador.
 *
 * Es lo que el cliente lee antes de comprar: horario, cobertura y cómo
 * contactar. Vive junto al modo de cobro porque son la misma clase de cosa
 * —parámetros del sistema que se cambian en caliente— y exigen el mismo
 * permiso.
 *
 * Los campos se declaran en una lista y no uno a uno en el formulario: así
 * agregar un dato del negocio es agregar una línea, y no hay dos sitios donde
 * la lista pueda quedar desincronizada.
 */

interface CampoEditable {
  nombre: keyof Omit<Negocio, 'ubicacion' | 'actualizadoEn'>;
  etiqueta: string;
  ayuda?: string;
  /** Los textos largos van en un área, no en una línea. */
  largo?: boolean;
}

const CAMPOS: CampoEditable[] = [
  { nombre: 'nombre', etiqueta: 'Nombre del negocio' },
  { nombre: 'lema', etiqueta: 'Lema', ayuda: 'La frase corta del encabezado y del pie' },
  { nombre: 'descripcion', etiqueta: 'Quiénes somos', largo: true },
  {
    nombre: 'horario',
    etiqueta: 'Horario de atención',
    ayuda: 'Se muestra tal cual se escribe aquí',
  },
  {
    nombre: 'cobertura',
    etiqueta: 'Zona de cobertura',
    largo: true,
    ayuda: 'Informativa: el sistema no rechaza direcciones fuera de esta zona',
  },
  { nombre: 'direccion', etiqueta: 'Dirección' },
  { nombre: 'telefono', etiqueta: 'Teléfono' },
  { nombre: 'whatsapp', etiqueta: 'WhatsApp' },
  { nombre: 'correo', etiqueta: 'Correo de contacto' },
];

export function PanelNegocio() {
  const { notificar } = useNotificaciones();
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api
      .get<Negocio>('/negocio')
      .then(setNegocio)
      .catch(() => notificar('error', 'No se pudo cargar la información del negocio'));
  }, [notificar]);

  function cambiar(nombre: CampoEditable['nombre'], valor: string) {
    setNegocio((actual) => (actual ? { ...actual, [nombre]: valor } : actual));
  }

  function moverPunto(coordenadas: Coordenadas) {
    const { lat, lon } = redondearCoordenadas(coordenadas);
    setNegocio((actual) =>
      actual ? { ...actual, ubicacion: { latitud: lat, longitud: lon } } : actual,
    );
  }

  async function guardar() {
    if (!negocio) return;

    setGuardando(true);
    try {
      const guardado = await api.put<Negocio>('/negocio', {
        ...Object.fromEntries(CAMPOS.map((c) => [c.nombre, negocio[c.nombre]])),
        latitud: negocio.ubicacion.latitud,
        longitud: negocio.ubicacion.longitud,
      });

      setNegocio(guardado);
      notificar('exito', 'La información del negocio quedó publicada');
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  if (!negocio) return <EsqueletoFilas filas={3} alto="h-16" />;

  const vacio = CAMPOS.some((c) => negocio[c.nombre].trim() === '');

  return (
    <section className="superficie-tarjeta rounded-2xl p-5">
      <header className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-marca-500/12 text-marca-300">
          <Store className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-tinta">Información del negocio</h2>
          <p className="mt-0.5 text-xs text-tinta-tenue">
            Lo que el cliente ve en el portal antes de pedir
            {negocio.actualizadoEn &&
              ` · última edición ${formatearFecha(negocio.actualizadoEn)}`}
          </p>
        </div>
      </header>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {CAMPOS.map((campo) => (
          <div key={campo.nombre} className={campo.largo ? 'sm:col-span-2' : undefined}>
            <Campo
              etiqueta={campo.etiqueta}
              ayuda={campo.ayuda}
              value={negocio[campo.nombre]}
              onChange={(e) => cambiar(campo.nombre, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs text-tinta-tenue">
          Toque el mapa para mover el punto del local.
        </p>
        <MapaUbicacion
          valor={{ lat: negocio.ubicacion.latitud, lon: negocio.ubicacion.longitud }}
          onCambiar={moverPunto}
          altura="h-64"
        />
      </div>

      <div className="mt-5 flex justify-end border-t border-borde pt-4">
        <Boton
          variante="primario"
          cargando={guardando}
          disabled={vacio}
          onClick={guardar}
          icono={<Save className="size-4" aria-hidden />}
        >
          Guardar y publicar
        </Boton>
      </div>
    </section>
  );
}
