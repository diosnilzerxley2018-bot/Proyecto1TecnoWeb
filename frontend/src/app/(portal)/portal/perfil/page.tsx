'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { ResumenCuenta } from '@/components/perfil/ResumenCuenta';
import { DatosPersonales } from '@/components/perfil/DatosPersonales';
import { PreferenciasCliente } from '@/components/perfil/PreferenciasCliente';
import { CambiarContrasena } from '@/components/perfil/CambiarContrasena';
import type { Perfil } from '@/types';

/**
 * CU-VEN-02, variación: "El cliente puede modificar sus propios datos, pero no
 * los de otros clientes."
 *
 * La cuenta se resuelve a partir de la sesión y nunca de un identificador en
 * la URL, de modo que desde aquí no existe forma de apuntar a la de otro. Dar
 * de baja la cuenta tampoco es una opción del titular: es decisión del
 * personal.
 *
 * Los componentes son los mismos que usa el personal en su propia cuenta. Lo
 * único exclusivo del cliente son las preferencias alimentarias.
 */
export default function PaginaPerfilCliente() {
  const { notificar } = useNotificaciones();

  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      setPerfil(await api.get<Perfil>('/perfil'));
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo cargar su perfil');
    } finally {
      setCargando(false);
    }
  }, [notificar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando || !perfil) return <EsqueletoFilas filas={4} alto="h-24" />;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Mi cuenta</h1>
        <p className="mt-1 text-sm text-tinta-tenue">
          Sus datos, sus preferencias y su contraseña
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <ResumenCuenta perfil={perfil} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.06 }}
          className="grid gap-5"
        >
          <DatosPersonales perfil={perfil} onActualizado={setPerfil} />
          <PreferenciasCliente perfil={perfil} onActualizado={setPerfil} />
          <CambiarContrasena />
        </motion.div>
      </div>
    </div>
  );
}
