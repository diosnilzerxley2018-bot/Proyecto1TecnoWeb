'use client';

import { AtSign, BriefcaseBusiness, CalendarDays, Clock, ShieldCheck } from 'lucide-react';
import { Insignia } from '@/components/ui/Insignia';
import type { Perfil } from '@/types';
import { formatearFecha } from '@/lib/formato';

/**
 * Tarjeta de identidad de la cuenta. Común al empleado y al cliente.
 *
 * El **último acceso** se muestra a propósito y no es un adorno: es la forma
 * más simple de que el titular note un ingreso que no hizo él. Es también la
 * única señal que hoy tiene, porque cerrar sesión no revoca las sesiones
 * abiertas en otros equipos.
 */
export function ResumenCuenta({ perfil }: { perfil: Perfil }) {
  const iniciales =
    `${perfil.nombre?.[0] ?? ''}${perfil.apellido?.[0] ?? ''}`.toUpperCase() || '··';

  return (
    <section className="superficie-tarjeta rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-full border border-borde bg-superficie-suave text-sm font-semibold text-marca-300">
          {iniciales}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-tinta">{perfil.nombreCompleto}</p>
          <p className="truncate text-[11px] text-tinta-tenue">@{perfil.nombreUsuario}</p>
        </div>
      </div>

      <dl className="mt-5 space-y-3.5">
        <Dato icono={<ShieldCheck className="size-3.5" aria-hidden />} etiqueta="Rol">
          <Insignia tono="marca">{perfil.rol}</Insignia>
        </Dato>

        <Dato icono={<AtSign className="size-3.5" aria-hidden />} etiqueta="Correo">
          {perfil.email}
        </Dato>

        {perfil.laboral && (
          <>
            <Dato
              icono={<BriefcaseBusiness className="size-3.5" aria-hidden />}
              etiqueta="Cargo"
            >
              {perfil.laboral.cargo}
            </Dato>
            <Dato icono={<CalendarDays className="size-3.5" aria-hidden />} etiqueta="Ingreso">
              {formatearFecha(perfil.laboral.fechaIngreso)}
            </Dato>
          </>
        )}

        {!perfil.laboral && (
          <Dato icono={<CalendarDays className="size-3.5" aria-hidden />} etiqueta="Registrado">
            {formatearFecha(perfil.fechaRegistro)}
          </Dato>
        )}

        <Dato icono={<Clock className="size-3.5" aria-hidden />} etiqueta="Último acceso">
          {perfil.ultimoAcceso ? formatearFecha(perfil.ultimoAcceso) : 'Este es el primero'}
        </Dato>
      </dl>

      <p className="mt-5 border-t border-borde pt-4 text-[11px] leading-relaxed text-tinta-tenue">
        Si no reconoce el último acceso, cambie su contraseña y avise al administrador.
      </p>
    </section>
  );
}

function Dato({
  icono,
  etiqueta,
  children,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
        {icono}
        {etiqueta}
      </dt>
      <dd className="mt-1 truncate text-sm text-tinta-suave">{children}</dd>
    </div>
  );
}
