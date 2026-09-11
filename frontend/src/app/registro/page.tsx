'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { CampoTexto } from '@/components/CampoTexto';
import { PieVisitas } from '@/components/ui/PieVisitas';
import { SelectorTema } from '@/components/ui/SelectorTema';
import { ErrorApi } from '@/lib/api';

/**
 * CU-VEN-02 — Autorregistro de cliente desde el portal web.
 *
 * Ruta pública: no requiere sesión previa. El rol de Cliente lo asigna el
 * servidor; esta pantalla nunca lo envía.
 */
export default function PaginaRegistro() {
  const { sesion, cargando, registrarCliente } = useAuth();
  const router = useRouter();

  const [datos, setDatos] = useState({
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    nombreUsuario: '',
    contrasena: '',
    confirmacion: '',
    preferenciaAlimentaria: '',
    restriccionDietetica: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!cargando && sesion) router.replace('/inicio');
  }, [sesion, cargando, router]);

  function actualizar<K extends keyof typeof datos>(clave: K, valor: string) {
    setDatos((prev) => ({ ...prev, [clave]: valor }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (datos.contrasena !== datos.confirmacion) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setEnviando(true);
    try {
      await registrarCliente({
        nombre: datos.nombre,
        apellido: datos.apellido,
        email: datos.email,
        telefono: datos.telefono || null,
        nombreUsuario: datos.nombreUsuario,
        contrasena: datos.contrasena,
        preferenciaAlimentaria: datos.preferenciaAlimentaria || null,
        restriccionDietetica: datos.restriccionDietetica || null,
      });
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'Error inesperado');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-white/5 p-4">
      <div className="w-full max-w-lg py-8">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-marca-300">NutriExpress</h1>
          <p className="mt-1 text-sm text-tinta-tenue">
            Cree su cuenta para realizar pedidos a domicilio
          </p>
        </div>

        <form
          onSubmit={enviar}
          className="space-y-3 rounded-xl bg-superficie p-6 shadow-sm ring-1 ring-borde"
        >
          <h2 className="text-lg font-semibold text-tinta">Registro de cliente</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoTexto id="nombre" etiqueta="Nombre" required autoComplete="given-name"
              value={datos.nombre} onChange={(e) => actualizar('nombre', e.target.value)} />
            <CampoTexto id="apellido" etiqueta="Apellido" required autoComplete="family-name"
              value={datos.apellido} onChange={(e) => actualizar('apellido', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoTexto id="email" etiqueta="Correo electrónico" type="email" required
              autoComplete="email"
              value={datos.email} onChange={(e) => actualizar('email', e.target.value)} />
            <CampoTexto id="telefono" etiqueta="Teléfono" autoComplete="tel"
              value={datos.telefono} onChange={(e) => actualizar('telefono', e.target.value)} />
          </div>

          <CampoTexto id="nombreUsuario" etiqueta="Nombre de usuario" required minLength={4}
            autoComplete="username" placeholder="Con el que iniciará sesión"
            value={datos.nombreUsuario} onChange={(e) => actualizar('nombreUsuario', e.target.value)} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoTexto id="contrasena" etiqueta="Contraseña" type="password" required
              autoComplete="new-password"
              value={datos.contrasena} onChange={(e) => actualizar('contrasena', e.target.value)}
              ayuda="Mínimo 8 caracteres, una letra y un número" />
            <CampoTexto id="confirmacion" etiqueta="Repita la contraseña" type="password" required
              autoComplete="new-password"
              value={datos.confirmacion} onChange={(e) => actualizar('confirmacion', e.target.value)} />
          </div>

          <fieldset className="rounded-lg bg-white/[0.03] p-3 ring-1 ring-borde">
            <legend className="px-1 text-xs font-medium text-tinta-suave">
              Sus preferencias (opcional)
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CampoTexto id="preferencia" etiqueta="Preferencia alimentaria"
                placeholder="Ej.: Vegetariana"
                value={datos.preferenciaAlimentaria}
                onChange={(e) => actualizar('preferenciaAlimentaria', e.target.value)} />
              <CampoTexto id="restriccion" etiqueta="Restricción dietética"
                placeholder="Ej.: Sin gluten"
                value={datos.restriccionDietetica}
                onChange={(e) => actualizar('restriccionDietetica', e.target.value)} />
            </div>
          </fieldset>

          {error && (
            <p role="alert"
              className="rounded-lg bg-peligro/10 px-3 py-2 text-sm text-peligro ring-1 ring-peligro/25">
              {error}
            </p>
          )}

          <button type="submit" disabled={enviando}
            className="w-full rounded-lg bg-marca-500 px-4 py-2 font-medium text-sobre-marca transition hover:bg-marca-400 disabled:opacity-50">
            {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <div className="mt-8 flex flex-col items-center gap-3">
          <SelectorTema />
          <PieVisitas />
        </div>

        <p className="mt-5 text-center text-sm text-tinta-suave">
          ¿Ya tiene cuenta?{' '}
          <Link href="/login" className="font-medium text-marca-300 hover:underline">
            Inicie sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
