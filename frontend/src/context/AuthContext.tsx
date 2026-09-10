'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { esPersonalInterno } from '@/lib/dominio';
import { guardarSesion, leerSesion, borrarSesion } from '@/lib/sesion';
import type { Sesion } from '@/types';

interface ContextoAuth {
  sesion: Sesion | null;
  cargando: boolean;
  iniciarSesion: (nombreUsuario: string, contrasena: string) => Promise<void>;
  registrarCliente: (datos: DatosRegistro) => Promise<void>;
  cerrarSesion: () => void;
  tienePermiso: (permiso: string) => boolean;
}

/** Datos del autorregistro. El rol lo impone el servidor: nunca se envía. */
export interface DatosRegistro {
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string | null;
  nombreUsuario: string;
  contrasena: string;
  preferenciaAlimentaria?: string | null;
  restriccionDietetica?: string | null;
}

const Contexto = createContext<ContextoAuth | null>(null);

/**
 * Pantalla de destino tras autenticarse.
 *
 * Cliente y personal usan la misma aplicación pero no el mismo espacio: el
 * cliente entra al portal de pedidos y el personal al escritorio de gestión.
 * Sin esta bifurcación, un cliente aterrizaría en un tablero cuyos permisos no
 * tiene y recibiría un 403 al primer clic.
 */
function destinoTras(sesion: Sesion): string {
  return esPersonalInterno(sesion.usuario.rol) ? '/inicio' : '/portal';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [cargando, setCargando] = useState(true);
  const router = useRouter();

  useEffect(() => {
    setSesion(leerSesion());
    setCargando(false);
  }, []);

  const iniciarSesion = useCallback(async (nombreUsuario: string, contrasena: string) => {
    const nueva = await api.post<Sesion>('/auth/login', { nombreUsuario, contrasena });
    guardarSesion(nueva);
    setSesion(nueva);
    router.push(destinoTras(nueva));
  }, [router]);

  const registrarCliente = useCallback(async (datos: DatosRegistro) => {
    const nueva = await api.post<Sesion>('/auth/registro', datos);
    guardarSesion(nueva);
    setSesion(nueva);
    router.push(destinoTras(nueva));
  }, [router]);

  const cerrarSesion = useCallback(() => {
    borrarSesion();
    setSesion(null);
    router.push('/login');
  }, [router]);

  const tienePermiso = useCallback(
    (permiso: string) => sesion?.permisos.includes(permiso) ?? false,
    [sesion],
  );

  return (
    <Contexto.Provider
      value={{ sesion, cargando, iniciarSesion, registrarCliente, cerrarSesion, tienePermiso }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
