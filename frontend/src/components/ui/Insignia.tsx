'use client';

import { cn } from '@/lib/cn';

export type Tono = 'neutro' | 'marca' | 'aviso' | 'peligro' | 'info' | 'violeta';

const TONOS: Record<Tono, string> = {
  neutro: 'bg-white/5 text-tinta-suave border-white/10',
  marca: 'bg-marca-500/12 text-marca-300 border-marca-500/25',
  aviso: 'bg-aviso/12 text-aviso border-aviso/25',
  peligro: 'bg-peligro/12 text-peligro border-peligro/25',
  info: 'bg-info/12 text-info border-info/25',
  violeta: 'bg-violeta/12 text-violeta border-violeta/25',
};

/** Etiqueta compacta de estado. El punto ayuda a distinguir sin depender del color. */
export function Insignia({
  tono = 'neutro',
  punto = false,
  children,
  className,
}: {
  tono?: Tono;
  punto?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1',
        'text-[11px] font-medium leading-none tracking-wide',
        TONOS[tono],
        className,
      )}
    >
      {punto && <span className="size-1.5 rounded-full bg-current animate-brillo" />}
      {children}
    </span>
  );
}
