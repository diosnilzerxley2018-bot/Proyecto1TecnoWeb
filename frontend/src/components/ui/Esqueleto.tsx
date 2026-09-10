'use client';

import { cn } from '@/lib/cn';

/** Bloque de carga con barrido de luz, en lugar de un simple pulso gris. */
export function Esqueleto({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg bg-white/[0.04]',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-[barrido_1.6s_infinite]',
        'after:bg-gradient-to-r after:from-transparent after:via-white/[0.07] after:to-transparent',
        className,
      )}
    >
      <style>{`@keyframes barrido { 100% { transform: translateX(100%); } }`}</style>
    </div>
  );
}

/** Filas de esqueleto para tablas y listados. */
export function EsqueletoFilas({ filas = 5, alto = 'h-14' }: { filas?: number; alto?: string }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: filas }).map((_, indice) => (
        <Esqueleto key={indice} className={alto} />
      ))}
    </div>
  );
}
