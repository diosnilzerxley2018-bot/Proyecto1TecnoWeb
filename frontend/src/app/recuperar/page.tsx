'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Check, KeyRound, Mail, MailCheck, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ErrorApi } from '@/lib/api';
import { Campo } from '@/components/ui/Campo';
import { Boton } from '@/components/ui/Boton';
import { FondoAcceso } from '@/components/ui/FondoAcceso';
import { PieVisitas } from '@/components/ui/PieVisitas';
import { SelectorTema } from '@/components/ui/SelectorTema';
import { RequisitosContrasena } from '@/components/ui/RequisitosContrasena';
import { cumpleLaPolitica } from '@/lib/dominio';

type Paso = 'pedir' | 'codigo' | 'nueva' | 'listo';

/** Lo que el servidor exige entre un código y el siguiente (`recuperacion.service`). */
const SEGUNDOS_PARA_REENVIAR = 60;

/**
 * «Olvidé mi contraseña»: un código de seis dígitos al correo de la cuenta.
 *
 * Tres pasos, como en casi todos los sistemas: pedir el código, escribirlo y
 * elegir la contraseña nueva. El código se confirma antes de pedir la
 * contraseña, para no hacer escribirla dos veces por un dígito mal copiado.
 * Cambiarla también desbloquea la cuenta: es la salida del administrador
 * bloqueado, que no tiene a nadie por encima que lo desbloquee.
 */
export default function PaginaRecuperar() {
  const { sesion, cargando } = useAuth();
  const router = useRouter();

  const [paso, setPaso] = useState<Paso>('pedir');
  const [identificador, setIdentificador] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    if (!cargando && sesion) router.replace('/inicio');
  }, [sesion, cargando, router]);

  // La cuenta regresiva del botón «Reenviar código».
  useEffect(() => {
    if (espera <= 0) return;
    const reloj = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(reloj);
  }, [espera]);

  /** Envía una petición y muestra su error, si lo hay, en el formulario. */
  async function intentar(accion: () => Promise<void>) {
    setError(null);
    setEnviando(true);
    try {
      await accion();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo completar. Intente de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  const pedirCodigo = () =>
    intentar(async () => {
      const r = await api.post<{ mensaje: string }>('/auth/recuperar', { identificador });
      setAviso(r.mensaje);
      setCodigo('');
      setEspera(SEGUNDOS_PARA_REENVIAR);
      setPaso('codigo');
    });

  const verificarCodigo = () =>
    intentar(async () => {
      await api.post('/auth/recuperar/verificar', { identificador, codigo });
      setPaso('nueva');
    });

  const cambiarContrasena = () =>
    intentar(async () => {
      await api.post('/auth/recuperar/restablecer', { identificador, codigo, contrasena: nueva });
      setPaso('listo');
    });

  const codigoCompleto = /^\d{6}$/.test(codigo.replace(/\s/g, ''));
  const coinciden = nueva.length > 0 && nueva === repetida;

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
              <KeyRound className="size-6" aria-hidden />
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-tinta">Recuperar la contraseña</h1>
          <p className="mt-1.5 text-sm text-tinta-tenue">
            {paso === 'pedir' && 'Le enviamos un código a su correo para crear una nueva'}
            {paso === 'codigo' && 'Escriba el código de 6 dígitos que le llegó'}
            {paso === 'nueva' && 'Elija su contraseña nueva'}
            {paso === 'listo' && 'Todo listo'}
          </p>
        </div>

        <div className="rounded-2xl vidrio p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,1)]">
          <AnimatePresence mode="wait">
            <motion.form
              key={paso}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (paso === 'pedir') void pedirCodigo();
                if (paso === 'codigo') void verificarCodigo();
                if (paso === 'nueva') void cambiarContrasena();
              }}
            >
              {paso === 'pedir' && (
                <>
                  <Campo
                    etiqueta="Correo o nombre de usuario"
                    required
                    autoFocus
                    autoComplete="username"
                    icono={<Mail className="size-4" aria-hidden />}
                    value={identificador}
                    onChange={(e) => setIdentificador(e.target.value)}
                    ayuda="El código llega al correo registrado en su cuenta"
                  />
                  <Boton
                    type="submit"
                    variante="primario"
                    tamano="lg"
                    cargando={enviando}
                    disabled={identificador.trim().length < 3}
                    className="w-full justify-center"
                  >
                    Enviar código
                  </Boton>
                </>
              )}

              {paso === 'codigo' && (
                <>
                  {aviso && (
                    <p className="flex items-start gap-2 rounded-xl border border-info/25 bg-info/[0.06] px-3.5 py-2.5 text-xs leading-relaxed text-info">
                      <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {aviso}
                    </p>
                  )}
                  <Campo
                    etiqueta="Código"
                    required
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={7}
                    placeholder="123456"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/[^\d ]/g, ''))}
                    ayuda="Vence en 15 minutos y sirve una sola vez"
                  />
                  <Boton
                    type="submit"
                    variante="primario"
                    tamano="lg"
                    cargando={enviando}
                    disabled={!codigoCompleto}
                    className="w-full justify-center"
                  >
                    Continuar
                  </Boton>
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setPaso('pedir');
                        setError(null);
                      }}
                      className="text-tinta-tenue transition-colors hover:text-tinta"
                    >
                      Usar otra cuenta
                    </button>
                    <button
                      type="button"
                      disabled={espera > 0 || enviando}
                      onClick={() => void pedirCodigo()}
                      className="text-marca-300 transition-colors hover:text-marca-400 disabled:cursor-not-allowed disabled:text-tinta-tenue"
                    >
                      {espera > 0 ? `Reenviar código en ${espera} s` : 'Reenviar código'}
                    </button>
                  </div>
                </>
              )}

              {paso === 'nueva' && (
                <>
                  <Campo
                    etiqueta="Contraseña nueva"
                    type="password"
                    required
                    autoFocus
                    autoComplete="new-password"
                    value={nueva}
                    onChange={(e) => setNueva(e.target.value)}
                  />
                  <Campo
                    etiqueta="Repetir la nueva"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={repetida}
                    onChange={(e) => setRepetida(e.target.value)}
                    error={repetida.length > 0 && !coinciden ? 'No coinciden' : undefined}
                  />
                  <RequisitosContrasena valor={nueva} />
                  <Boton
                    type="submit"
                    variante="primario"
                    tamano="lg"
                    cargando={enviando}
                    disabled={!cumpleLaPolitica(nueva) || !coinciden}
                    className="w-full justify-center"
                  >
                    Cambiar contraseña
                  </Boton>
                  <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-tinta-tenue">
                    <ShieldCheck className="mt-0.5 size-3 shrink-0" aria-hidden />
                    Si su cuenta estaba bloqueada, también queda desbloqueada.
                  </p>
                </>
              )}

              {paso === 'listo' && (
                <div className="space-y-4 text-center">
                  <div className="mx-auto grid size-14 place-items-center rounded-full bg-marca-500/15 text-marca-400">
                    <Check className="size-7" strokeWidth={3} aria-hidden />
                  </div>
                  <p className="text-sm text-tinta">
                    Su contraseña fue cambiada. Ya puede iniciar sesión con la nueva.
                  </p>
                  <p className="text-xs text-tinta-tenue">
                    Le enviamos un aviso a su correo. Si no fue usted, respóndalo de inmediato.
                  </p>
                  <Link href="/login" className="block">
                    <Boton variante="primario" tamano="lg" className="w-full justify-center">
                      Iniciar sesión
                    </Boton>
                  </Link>
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-peligro/25 bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {error}
                </p>
              )}
            </motion.form>
          </AnimatePresence>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <SelectorTema />
          <PieVisitas />
        </div>

        {paso !== 'listo' && (
          <p className="mt-6 text-center text-sm">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-tinta-tenue transition-colors hover:text-tinta"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Volver a iniciar sesión
            </Link>
          </p>
        )}
      </motion.div>
    </main>
  );
}
