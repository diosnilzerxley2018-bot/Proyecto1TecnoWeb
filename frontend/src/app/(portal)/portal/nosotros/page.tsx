'use client';

import { useEffect, useState } from 'react';
import {
  Clock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { MapaUbicacion } from '@/components/pedidos/MapaUbicacion';
import type { Negocio } from '@/types';

/**
 * RF-PED-03 — información del negocio.
 *
 * Lo que un cliente necesita saber **antes** de pedir: a qué hora abren, hasta
 * dónde llevan, y cómo alcanzarlos si algo sale mal. Son las tres preguntas
 * que, sin esta página, terminan en una llamada.
 *
 * Los datos no están escritos aquí: vienen de la configuración que el
 * administrador edita desde su perfil, igual que el modo de cobro. Un horario
 * cambia, y corregirlo no debería necesitar un programador.
 */
export default function PaginaNosotros() {
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Negocio>('/negocio')
      .then(setNegocio)
      .catch(() => setError('No se pudo cargar la información del negocio'));
  }, []);

  if (error) {
    return (
      <p role="alert" className="rounded-2xl bg-peligro/10 px-5 py-4 text-sm text-peligro">
        {error}
      </p>
    );
  }

  if (!negocio) return <EsqueletoFilas filas={4} alto="h-24" />;

  return (
    <div className="space-y-6">
      <header className="superficie-tarjeta rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-tinta sm:text-3xl">{negocio.nombre}</h1>
        <p className="mt-1.5 text-sm text-marca-300">{negocio.lema}</p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-tinta-suave">
          {negocio.descripcion}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Dato icono={Clock} etiqueta="Horario de atención" valor={negocio.horario} />
        <Dato icono={Truck} etiqueta="Zona de cobertura" valor={negocio.cobertura} />
        <Dato icono={MapPin} etiqueta="Dirección" valor={negocio.direccion} />
        <Dato
          icono={Phone}
          etiqueta="Teléfono"
          valor={negocio.telefono}
          enlace={`tel:${negocio.telefono.replace(/\s/g, '')}`}
        />
        <Dato
          icono={MessageCircle}
          etiqueta="WhatsApp"
          valor={negocio.whatsapp}
          // `wa.me` quiere el número sin espacios ni signos.
          enlace={`https://wa.me/${negocio.whatsapp.replace(/\D/g, '')}`}
        />
        <Dato
          icono={Mail}
          etiqueta="Correo"
          valor={negocio.correo}
          enlace={`mailto:${negocio.correo}`}
        />
      </div>

      <section className="superficie-tarjeta overflow-hidden rounded-2xl">
        <h2 className="border-b border-borde px-5 py-3.5 text-sm font-medium text-tinta">
          Dónde estamos
        </h2>
        {/* Sin `onCambiar` el mapa es de solo lectura: aquí se mira, no se elige. */}
        <MapaUbicacion
          valor={{ lat: negocio.ubicacion.latitud, lon: negocio.ubicacion.longitud }}
          altura="h-72 sm:h-96"
        />
      </section>
    </div>
  );
}

function Dato({
  icono: Icono,
  etiqueta,
  valor,
  enlace,
}: {
  icono: LucideIcon;
  etiqueta: string;
  valor: string;
  /** Cuando el dato se puede accionar: llamar, escribir, abrir WhatsApp. */
  enlace?: string;
}) {
  const contenido = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-marca-500/12 text-marca-300">
        <Icono className="size-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
          {etiqueta}
        </span>
        <span className="mt-0.5 block text-sm text-tinta-suave">{valor}</span>
      </span>
    </>
  );

  const clases = 'superficie-tarjeta flex items-start gap-3 rounded-2xl p-4';

  return enlace ? (
    <a
      href={enlace}
      target={enlace.startsWith('http') ? '_blank' : undefined}
      rel={enlace.startsWith('http') ? 'noreferrer' : undefined}
      className={`${clases} transition-colors hover:border-marca-500/40`}
    >
      {contenido}
    </a>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}
