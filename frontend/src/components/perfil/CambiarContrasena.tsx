'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, KeyRound, ShieldCheck } from 'lucide-react';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { Campo } from '@/components/ui/Campo';
import { Boton } from '@/components/ui/Boton';
import { cn } from '@/lib/cn';

/**
 * Cambio de la propia contraseña. Lo usan el empleado y el cliente por igual.
 *
 * Vive en un componente compartido porque la operación es idéntica para los
 * dos: misma política, mismos avisos, mismo endpoint. Dos copias habrían
 * significado que corregir un texto en una dejara la otra atrás.
 *
 * Los requisitos se muestran **mientras se escribe**, no como un error después
 * de enviar. Una política que solo se conoce al fallar obliga a adivinar.
 */

/** RF-SEG-03. Se refleja aquí lo que el servidor exige, no algo más laxo. */
const REQUISITOS: { texto: string; cumple: (v: string) => boolean }[] = [
  { texto: 'Al menos 8 caracteres', cumple: (v) => v.length >= 8 },
  { texto: 'Una mayúscula', cumple: (v) => /[A-Z]/.test(v) },
  { texto: 'Una minúscula', cumple: (v) => /[a-z]/.test(v) },
  { texto: 'Un número', cumple: (v) => /[0-9]/.test(v) },
  { texto: 'Un carácter especial', cumple: (v) => /[^A-Za-z0-9]/.test(v) },
];

export function CambiarContrasena() {
  const { notificar } = useNotificaciones();

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cumpleTodo = REQUISITOS.every((r) => r.cumple(nueva));
  const coinciden = nueva.length > 0 && nueva === repetida;
  const esOtra = nueva !== actual;
  const listo = actual.length > 0 && cumpleTodo && coinciden && esOtra;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      await api.put('/perfil/contrasena', {
        contrasenaActual: actual,
        contrasenaNueva: nueva,
      });
      setActual('');
      setNueva('');
      setRepetida('');
      notificar('exito', 'Contraseña actualizada. Úsela la próxima vez que inicie sesión.');
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo cambiar la contraseña');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="superficie-tarjeta rounded-2xl">
      <header className="flex items-center gap-2 border-b border-borde px-5 py-4">
        <KeyRound className="size-4 shrink-0 text-marca-400" aria-hidden />
        <h2 className="text-sm font-medium text-tinta">Contraseña</h2>
      </header>

      <form onSubmit={enviar} className="space-y-4 px-5 py-5">
        <Campo
          etiqueta="Contraseña actual"
          type="password"
          autoComplete="current-password"
          required
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          ayuda="Se pide aunque su sesión esté abierta: es lo que impide que alguien que la encuentre abierta se quede con la cuenta"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Contraseña nueva"
            type="password"
            autoComplete="new-password"
            required
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
          />
          <Campo
            etiqueta="Repetir la nueva"
            type="password"
            autoComplete="new-password"
            required
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            error={repetida.length > 0 && !coinciden ? 'No coinciden' : undefined}
          />
        </div>

        <AnimatePresence initial={false}>
          {nueva.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              aria-label="Requisitos de la contraseña"
              className="grid gap-1 overflow-hidden rounded-xl border border-borde bg-white/[0.02] p-3 sm:grid-cols-2"
            >
              {REQUISITOS.map((requisito) => {
                const cumple = requisito.cumple(nueva);
                return (
                  <li
                    key={requisito.texto}
                    className={cn(
                      'flex items-center gap-1.5 text-[11px] transition-colors',
                      cumple ? 'text-marca-300' : 'text-tinta-tenue',
                    )}
                  >
                    <Check
                      className={cn('size-3 shrink-0', !cumple && 'opacity-25')}
                      aria-hidden
                    />
                    {requisito.texto}
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>

        {nueva.length > 0 && !esOtra && (
          <p className="text-xs text-aviso">La nueva debe ser distinta de la actual.</p>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-borde pt-4">
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-tinta-tenue">
            <ShieldCheck className="mt-0.5 size-3 shrink-0" aria-hidden />
            Las sesiones abiertas en otros dispositivos siguen activas.
          </p>
          <Boton type="submit" variante="primario" cargando={enviando} disabled={!listo}>
            Cambiar
          </Boton>
        </div>
      </form>
    </section>
  );
}
