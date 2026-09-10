'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight, KeyRound, ShieldOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { modulosAccesibles, type Modulo } from '@/lib/modulos';
import { Tarjeta } from '@/components/ui/Tarjeta';
import { Insignia } from '@/components/ui/Insignia';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { cn } from '@/lib/cn';

export default function PaginaInicio() {
  const { sesion, tienePermiso } = useAuth();
  const modulos = modulosAccesibles(tienePermiso);
  const cantidadPermisos = sesion?.permisos.length ?? 0;

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="mb-9"
      >
        <p className="text-sm text-tinta-tenue">Bienvenido de vuelta</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-tinta">
          {sesion?.usuario.nombre} {sesion?.usuario.apellido}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Insignia tono="marca">{sesion?.usuario.rol}</Insignia>
          <Insignia tono="neutro">
            <KeyRound className="size-3" aria-hidden />
            {cantidadPermisos} {cantidadPermisos === 1 ? 'permiso' : 'permisos'}
          </Insignia>
        </div>
      </motion.header>

      <section>
        <h2 className="mb-4 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
          Módulos disponibles
        </h2>

        {modulos.length === 0 ? (
          <EstadoVacio
            icono={<ShieldOff className="size-6" aria-hidden />}
            titulo="Todavía no tiene módulos habilitados"
            descripcion="Solicite al administrador que le asigne los permisos correspondientes a su rol."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {modulos.map((modulo, indice) => (
              <TarjetaModulo key={modulo.ruta} modulo={modulo} indice={indice} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function TarjetaModulo({ modulo, indice }: { modulo: Modulo; indice: number }) {
  const Icono = modulo.icono;

  const cuerpo = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'grid size-11 place-items-center rounded-xl border transition-colors duration-300',
            modulo.implementado
              ? 'border-marca-500/25 bg-marca-500/10 text-marca-400 group-hover:border-marca-500/50 group-hover:bg-marca-500/15'
              : 'border-borde bg-white/[0.03] text-tinta-tenue',
          )}
        >
          <Icono className="size-5" aria-hidden />
        </span>

        {modulo.implementado ? (
          <ArrowUpRight className="size-4 shrink-0 text-tinta-tenue transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-marca-400" aria-hidden />
        ) : (
          <Insignia tono="aviso">En desarrollo</Insignia>
        )}
      </div>

      <div className="mt-4">
        <h3
          className={cn(
            'font-medium',
            modulo.implementado ? 'text-tinta' : 'text-tinta-tenue',
          )}
        >
          {modulo.titulo}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-tinta-tenue">{modulo.descripcion}</p>
      </div>
    </>
  );

  if (!modulo.implementado) {
    return (
      <Tarjeta
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: indice * 0.06, ease: 'easeOut' }}
        className="cursor-not-allowed p-5 opacity-60"
      >
        {cuerpo}
      </Tarjeta>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: indice * 0.06, ease: 'easeOut' }}
    >
      <Link href={modulo.ruta} className="block">
        <Tarjeta interactiva className="group h-full p-5">
          {cuerpo}
        </Tarjeta>
      </Link>
    </motion.div>
  );
}
