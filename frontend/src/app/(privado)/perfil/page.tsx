'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api, ErrorApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { EsqueletoFilas } from '@/components/ui/Esqueleto';
import { ResumenCuenta } from '@/components/perfil/ResumenCuenta';
import { DatosPersonales } from '@/components/perfil/DatosPersonales';
import { CambiarContrasena } from '@/components/perfil/CambiarContrasena';
import { PanelModoCobro } from '@/components/ajustes/PanelModoCobro';
import { PanelNegocio } from '@/components/ajustes/PanelNegocio';
import type { Perfil } from '@/types';

/**
 * Cuenta del personal interno.
 *
 * Reúne tres cosas distintas y conviene no confundirlas:
 *
 * 1. **Lo que el titular administra de sí mismo** — sus datos y su contraseña.
 * 2. **Lo que solo puede ver** — su rol, su cargo, su último acceso.
 * 3. **Lo que administra del sistema**, si su rol se lo permite — hoy, el modo
 *    de cobro.
 *
 * El modo de cobro vive aquí y no en un módulo aparte porque activar el dinero
 * real es una decisión personal del administrador, no una operación del día a
 * día que convenga tener a mano en la barra lateral.
 */
export default function PaginaPerfil() {
  const { tienePermiso } = useAuth();
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

  const puedeConfigurar = tienePermiso('CONFIGURACION_GESTIONAR');

  return (
    <>
      <EncabezadoPagina
        titulo="Mi cuenta"
        descripcion="Sus datos, su contraseña y los ajustes del sistema a su cargo"
      />

      {cargando || !perfil ? (
        <EsqueletoFilas filas={4} alto="h-24" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
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
            <CambiarContrasena />
            {puedeConfigurar && <PanelModoCobro />}
            {puedeConfigurar && <PanelNegocio />}
          </motion.div>
        </div>
      )}
    </>
  );
}
