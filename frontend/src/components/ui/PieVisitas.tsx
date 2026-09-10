'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Eye } from 'lucide-react';
import { api } from '@/lib/api';

interface Contador {
  total: number;
  desde: string | null;
}

const CLAVE_SESION = 'nutriexpress.visita-registrada';

/**
 * RF-WEB-03 — "Cada página debe mostrar en su pie el número de visitas
 * acumuladas."
 *
 * Se contabiliza **una visita por sesión de navegador**, no una por cada
 * cambio de pantalla. En una aplicación de una sola página el usuario navega
 * decenas de veces sin volver a entrar al sitio, y contar cada transición
 * inflaría el número hasta volverlo inútil como medida de visitas.
 */
export function PieVisitas() {
  const [contador, setContador] = useState<Contador | null>(null);

  useEffect(() => {
    let vigente = true;

    async function contabilizar() {
      try {
        let yaRegistrada = false;
        try {
          yaRegistrada = sessionStorage.getItem(CLAVE_SESION) === '1';
        } catch {
          // Sin sessionStorage se consulta sin registrar, para no inflar el total.
          yaRegistrada = true;
        }

        const datos = yaRegistrada
          ? await api.get<Contador>('/visitas')
          : await api.post<Contador>('/visitas', { ruta: window.location.pathname });

        if (!yaRegistrada) {
          try {
            sessionStorage.setItem(CLAVE_SESION, '1');
          } catch {
            // El registro ya ocurrió en el servidor; no reintentar es lo correcto.
          }
        }

        if (vigente) setContador(datos);
      } catch {
        // El contador es informativo: si la API no responde, el pie se omite.
      }
    }

    void contabilizar();
    return () => {
      vigente = false;
    };
  }, []);

  if (!contador) return null;

  const anio = contador.desde ? new Date(contador.desde).getFullYear() : null;

  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex items-center justify-center gap-1.5 text-[11px] text-tinta-tenue"
    >
      <Eye className="size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="tabular-nums text-tinta-suave">
          {contador.total.toLocaleString('es-BO')}
        </span>{' '}
        {contador.total === 1 ? 'visita acumulada' : 'visitas acumuladas'}
        {anio && ` desde ${anio}`}
      </span>
    </motion.p>
  );
}
