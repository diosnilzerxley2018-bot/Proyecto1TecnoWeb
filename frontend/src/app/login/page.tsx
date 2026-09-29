'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertCircle, KeyRound, LogIn, Sprout, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ErrorApi } from '@/lib/api';
import { Campo } from '@/components/ui/Campo';
import { Boton } from '@/components/ui/Boton';
import { PieVisitas } from '@/components/ui/PieVisitas';
import { SelectorTema } from '@/components/ui/SelectorTema';
import { FondoAcceso } from '@/components/ui/FondoAcceso';

/** CU-SEG-01 — Iniciar Sesión. */
export default function PaginaLogin() {
  const { sesion, cargando, iniciarSesion } = useAuth();
  const router = useRouter();

  const [nombreUsuario, setNombreUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!cargando && sesion) router.replace('/inicio');
  }, [sesion, cargando, router]);

  async function alEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await iniciarSesion(nombreUsuario, contrasena);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'Error inesperado');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden p-4">
      <FondoAcceso />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-2xl bg-marca-500/30 blur-xl" />
            <div className="relative grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-marca-400 to-marca-600 text-sobre-marca">
              <Sprout className="size-6" aria-hidden />
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-tinta">NutriExpress</h1>
          <p className="mt-1.5 text-sm text-tinta-tenue">
            Gestión de ventas, pedidos, producción e inventario
          </p>
        </div>

        <form onSubmit={alEnviar} className="space-y-4 rounded-2xl vidrio p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,1)]">
          <Campo
            etiqueta="Usuario"
            required
            autoComplete="username"
            autoFocus
            icono={<User className="size-4" aria-hidden />}
            value={nombreUsuario}
            onChange={(e) => setNombreUsuario(e.target.value)}
            ayuda="Es su nombre de usuario, no su correo electrónico"
          />

          <Campo
            etiqueta="Contraseña"
            type="password"
            required
            autoComplete="current-password"
            icono={<KeyRound className="size-4" aria-hidden />}
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />

          <p className="-mt-2 text-right text-xs">
            <Link
              href="/recuperar"
              className="text-marca-300 underline-offset-4 transition-colors hover:text-marca-400 hover:underline"
            >
              ¿Olvidó su contraseña?
            </Link>
          </p>

          {error && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-start gap-2 rounded-xl border border-peligro/25 bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {error}
                {/* Bloqueado, lo que sirve es el código al correo: también
                    desbloquea la cuenta, sin esperar al administrador. */}
                {/bloquead/i.test(error) && (
                  <>
                    {' '}
                    <Link href="/recuperar" className="font-medium underline underline-offset-2">
                      Recupere su acceso con un código a su correo
                    </Link>
                  </>
                )}
              </span>
            </motion.p>
          )}

          <Boton
            type="submit"
            variante="primario"
            tamano="lg"
            cargando={enviando}
            className="w-full justify-center"
            icono={<LogIn className="size-4" aria-hidden />}
          >
            Entrar
          </Boton>
        </form>

        <div className="mt-8 flex flex-col items-center gap-3">
          <SelectorTema />
          <PieVisitas />
        </div>

        <p className="mt-6 text-center text-sm text-tinta-tenue">
          ¿Es cliente y no tiene cuenta?{' '}
          <Link
            href="/registro"
            className="font-medium text-marca-300 underline-offset-4 transition-colors hover:text-marca-200 hover:underline"
          >
            Regístrese
          </Link>
        </p>
      </motion.div>
    </main>
  );
}
