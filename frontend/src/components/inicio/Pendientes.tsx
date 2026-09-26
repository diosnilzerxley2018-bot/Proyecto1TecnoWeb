'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Bike,
  CalendarClock,
  ChefHat,
  ClipboardList,
  PackageMinus,
  Receipt,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useRefrescoPeriodico } from '@/components/ui/usarRefrescoPeriodico';
import { Esqueleto } from '@/components/ui/Esqueleto';
import { CARGO_REPARTIDOR } from '@/lib/dominio';
import { fechaIsoLocal, formatearBs } from '@/lib/formato';
import { cn } from '@/lib/cn';
import type { AlertaStock, LoteVigente, PedidoGestion, ReporteVentas } from '@/types';

/**
 * Lo que le espera hoy a quien entra, antes que la lista de módulos.
 *
 * El inicio mostraba lo mismo a todos —cuatro módulos iguales— y nada de lo
 * que había por hacer: el cocinero tenía que entrar a Pedidos para saber si
 * había algo que preparar, y la almacenera a Stock para enterarse de que un
 * insumo se estaba acabando. Cada tarjeta dice cuántos hay y lleva a la
 * pantalla donde se atienden.
 */

type Clave = 'pedidos' | 'entregas' | 'ordenes' | 'reponer' | 'vencer' | 'ventas';

interface Pendiente {
  clave: Clave;
  titulo: string;
  valor: string;
  detalle: string;
  ruta: string;
  icono: LucideIcon;
  /** Hay algo por hacer: la tarjeta se destaca. */
  urgente: boolean;
}

/**
 * Qué mira primero cada cargo. Sin cargo conocido —o el administrador—, todo
 * lo que sus permisos le dejan ver. Es enfoque, no seguridad: lo que no se
 * muestra aquí sigue a un clic en su módulo.
 */
const ENFOQUE: Record<string, Clave[]> = {
  Vendedor: ['ventas', 'pedidos'],
  Cocinero: ['pedidos', 'ordenes', 'reponer'],
  Almacenero: ['reponer', 'vencer'],
  [CARGO_REPARTIDOR]: ['entregas'],
};

const TODAS: Clave[] = ['pedidos', 'ordenes', 'reponer', 'vencer', 'ventas'];

/** Con nombres: «Leche, Tomate y 2 más» dice más que «4». */
function enumerar(nombres: string[]): string {
  if (nombres.length <= 2) return nombres.join(' y ');
  return `${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} más`;
}

/**
 * De dónde sale cada tarjeta y qué permiso pide: el mismo que la pantalla a la
 * que lleva, para no mostrar una cifra que después no se puede abrir.
 */
const FUENTES: Record<Clave, { permiso: string; cargar: () => Promise<Pendiente> }> = {
  pedidos: {
    permiso: 'PEDIDO_LEER',
    cargar: async () => {
      const cuenta = await api.get<Record<string, number>>('/gestion/pedidos/resumen');
      const recibidos = cuenta['Recibido'] ?? 0;
      return {
        clave: 'pedidos',
        titulo: 'Pedidos por preparar',
        valor: String(recibidos),
        detalle: `${cuenta['En preparacion'] ?? 0} en cocina · ${cuenta['En camino'] ?? 0} en camino`,
        ruta: '/pedidos/lista?estado=Recibido',
        icono: ClipboardList,
        urgente: recibidos > 0,
      };
    },
  },
  entregas: {
    permiso: 'PEDIDO_LEER',
    cargar: async () => {
      const mias = await api.get<PedidoGestion[]>('/gestion/mis-entregas');
      const enCamino = mias.filter((p) => p.estadoPedido === 'En camino').length;
      const porSalir = mias.filter((p) => p.estadoPedido === 'En preparacion').length;
      return {
        clave: 'entregas',
        titulo: 'Sus entregas',
        valor: String(enCamino + porSalir),
        detalle: `${enCamino} en camino · ${porSalir} por salir`,
        ruta: '/entregas',
        icono: Bike,
        urgente: enCamino + porSalir > 0,
      };
    },
  },
  ordenes: {
    permiso: 'ORDEN_PRODUCCION_GESTIONAR',
    cargar: async () => {
      const cuenta = await api.get<Record<string, number>>('/ordenes/resumen');
      const pendientes = cuenta['Pendiente'] ?? 0;
      const enProceso = cuenta['En proceso'] ?? 0;
      return {
        clave: 'ordenes',
        titulo: 'Órdenes de producción',
        valor: String(pendientes + enProceso),
        detalle: `${pendientes} por empezar · ${enProceso} en proceso`,
        ruta: '/produccion/ordenes',
        icono: ChefHat,
        urgente: pendientes + enProceso > 0,
      };
    },
  },
  reponer: {
    permiso: 'STOCK_CONSULTAR',
    cargar: async () => {
      const alertas = await api.get<AlertaStock[]>('/stock/alertas');
      return {
        clave: 'reponer',
        titulo: 'Insumos por reponer',
        valor: String(alertas.length),
        detalle:
          alertas.length === 0
            ? 'Todos por encima de su mínimo'
            : enumerar(alertas.map((a) => a.nombre)),
        ruta: '/inventario/stock',
        icono: PackageMinus,
        urgente: alertas.length > 0,
      };
    },
  },
  vencer: {
    permiso: 'STOCK_CONSULTAR',
    cargar: async () => {
      const lotes = await api.get<LoteVigente[]>('/stock/vencimientos?dias=7');
      return {
        clave: 'vencer',
        titulo: 'Lotes por vencer esta semana',
        valor: String(lotes.length),
        detalle:
          lotes.length === 0
            ? 'Ninguno vence en los próximos 7 días'
            : enumerar([...new Set(lotes.map((l) => l.insumo))]),
        ruta: '/inventario/stock',
        icono: CalendarClock,
        urgente: lotes.length > 0,
      };
    },
  },
  ventas: {
    permiso: 'VENTA_LEER',
    cargar: async () => {
      const hoy = fechaIsoLocal();
      const reporte = await api.get<ReporteVentas>(`/reportes/ventas?desde=${hoy}&hasta=${hoy}`);
      const n = reporte.resumen.cantidadVentas;
      return {
        clave: 'ventas',
        titulo: 'Vendido hoy en el local',
        valor: formatearBs(reporte.resumen.total),
        detalle: n === 0 ? 'Todavía no hay ventas hoy' : `${n} ${n === 1 ? 'venta' : 'ventas'}`,
        ruta: '/ventas/historial',
        icono: Receipt,
        urgente: false,
      };
    },
  },
};

export function Pendientes() {
  const { sesion, tienePermiso } = useAuth();
  const cargo = sesion?.usuario.cargo;
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null);

  const claves = ((cargo && ENFOQUE[cargo]) || TODAS).filter((c) =>
    tienePermiso(FUENTES[c].permiso),
  );
  const firma = claves.join(',');

  const cargar = useCallback(async () => {
    // Cada tarjeta por su cuenta: si una consulta falla, las otras se ven igual.
    const resultados = await Promise.allSettled(
      firma
        .split(',')
        .filter(Boolean)
        .map((c) => FUENTES[c as Clave].cargar()),
    );
    setPendientes(
      resultados.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
    );
  }, [firma]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // El inicio suele quedar abierto: las cifras se ponen al día solas.
  useRefrescoPeriodico(cargar, 60_000, claves.length > 0);

  if (claves.length === 0) return null;

  return (
    <section className="mb-9">
      <h2 className="mb-4 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue">
        Para hoy
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pendientes === null
          ? claves.map((c) => <Esqueleto key={c} className="h-28 rounded-2xl" />)
          : pendientes.map((p, indice) => <TarjetaPendiente key={p.clave} pendiente={p} indice={indice} />)}
      </div>
    </section>
  );
}

function TarjetaPendiente({ pendiente, indice }: { pendiente: Pendiente; indice: number }) {
  const Icono = pendiente.icono;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: indice * 0.05, ease: 'easeOut' }}
    >
      <Link
        href={pendiente.ruta}
        className={cn(
          'group flex h-full items-start gap-4 rounded-2xl border p-4 transition-colors',
          pendiente.urgente
            ? 'border-aviso/30 bg-aviso/[0.06] hover:border-aviso/50'
            : 'superficie-tarjeta border-borde hover:border-borde-fuerte',
        )}
      >
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl',
            pendiente.urgente ? 'bg-aviso/15 text-aviso' : 'bg-marca-500/10 text-marca-400',
          )}
        >
          <Icono className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-2xl font-semibold leading-none tabular-nums text-tinta">
            {pendiente.valor}
          </span>
          <span className="mt-1.5 block text-sm text-tinta">{pendiente.titulo}</span>
          <span className="mt-0.5 block truncate text-xs text-tinta-tenue">{pendiente.detalle}</span>
        </span>
        <ArrowUpRight
          className="size-4 shrink-0 text-tinta-tenue transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </motion.div>
  );
}
