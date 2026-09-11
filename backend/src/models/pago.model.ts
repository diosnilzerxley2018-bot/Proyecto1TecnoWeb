import { prisma } from '../config/prisma.js';
import type { ClientePrisma } from './stock.model.js';

/** Capa Model — tablas `pago` y `evento_pago`. */

/**
 * El último evento del cobro.
 *
 * Un cobro fallido sin motivo obliga a ir a los registros del servidor para
 * saber qué pasó, y eso no está al alcance de quien atiende el mostrador.
 * Cuesta una consulta más y convierte «El cobro no se completó» en algo
 * accionable.
 */
const ULTIMO_EVENTO = {
  orderBy: { recibido_en: 'desc' },
  take: 1,
  select: { tipo: true, cuerpo: true, recibido_en: true },
} as const;

const CAMPOS = {
  id_pago: true,
  monto: true,
  moneda: true,
  metodo: true,
  estado: true,
  modo: true,
  pasarela: true,
  id_transaccion_ext: true,
  evento_pago: ULTIMO_EVENTO,
  datos_cobro: true,
  fecha_creacion: true,
  fecha_expiracion: true,
  fecha_confirmacion: true,
  id_venta: true,
  id_pedido: true,
} as const;

export const crear = (
  tx: ClientePrisma,
  datos: {
    monto: number;
    moneda: string;
    metodo: string;
    estado: string;
    modo: string;
    pasarela: string;
    idVenta: number | null;
    idPedido: number | null;
    fechaConfirmacion?: Date | null;
  },
) =>
  tx.pago.create({
    data: {
      monto: datos.monto,
      moneda: datos.moneda,
      metodo: datos.metodo,
      estado: datos.estado,
      modo: datos.modo,
      pasarela: datos.pasarela,
      id_venta: datos.idVenta,
      id_pedido: datos.idPedido,
      fecha_confirmacion: datos.fechaConfirmacion ?? null,
    },
    select: CAMPOS,
  });

export const buscarPorId = (id: number, tx: ClientePrisma = prisma) =>
  tx.pago.findUnique({ where: { id_pago: id }, select: CAMPOS });

/** Búsqueda por el identificador de la pasarela: es como llega un aviso. */
export const buscarPorTransaccionExterna = (
  pasarela: string,
  idTransaccionExterna: string,
  tx: ClientePrisma = prisma,
) =>
  tx.pago.findFirst({
    where: { pasarela, id_transaccion_ext: idTransaccionExterna },
    select: CAMPOS,
  });

export const buscarDeVenta = (idVenta: number, tx: ClientePrisma = prisma) =>
  tx.pago.findFirst({ where: { id_venta: idVenta }, select: CAMPOS });

export const buscarDePedido = (idPedido: number, tx: ClientePrisma = prisma) =>
  tx.pago.findFirst({ where: { id_pedido: idPedido }, select: CAMPOS });

export const listar = (filtro: { estado?: string; modo?: string } = {}) =>
  prisma.pago.findMany({
    where: {
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.modo ? { modo: filtro.modo } : {}),
    },
    orderBy: { fecha_creacion: 'desc' },
    select: CAMPOS,
  });

/** Enlaza el cobro con la transacción que la pasarela acaba de abrir. */
export const registrarTransaccionExterna = (
  id: number,
  datos: { idTransaccionExterna: string; datosCobro: string; expiraEn: Date },
  tx: ClientePrisma = prisma,
) =>
  tx.pago.update({
    where: { id_pago: id },
    data: {
      id_transaccion_ext: datos.idTransaccionExterna,
      datos_cobro: datos.datosCobro,
      fecha_expiracion: datos.expiraEn,
    },
    select: CAMPOS,
  });

/**
 * Cambia el estado **solo si sigue Pendiente**.
 *
 * La condición viaja dentro del propio `updateMany`, no en un `if` previo: dos
 * avisos simultáneos de la pasarela —que las pasarelas reintentan— llegarían
 * los dos a la comprobación antes de que ninguno escriba. Devuelve si el
 * cambio se aplicó, y quien recibe `false` sabe que otro llegó primero.
 */
export const cerrarSiPendiente = async (
  tx: ClientePrisma,
  id: number,
  estado: string,
  fechaConfirmacion: Date | null,
): Promise<boolean> => {
  const resultado = await tx.pago.updateMany({
    where: { id_pago: id, estado: 'Pendiente' },
    data: { estado, fecha_confirmacion: fechaConfirmacion },
  });
  return resultado.count === 1;
};

/**
 * Marca el cobro como reembolsado.
 *
 * A diferencia de `cerrarSiPendiente`, este parte de un cobro **ya pagado**,
 * de modo que la condición no es que siga pendiente sino que lo esté.
 */
export const marcarReembolsado = (tx: ClientePrisma, id: number) =>
  tx.pago.updateMany({
    where: { id_pago: id, estado: 'Pagado' },
    data: { estado: 'Reembolsado' },
  });

/** Cobros vencidos que siguen figurando como pendientes. */
export const pendientesVencidos = (tx: ClientePrisma = prisma) =>
  tx.pago.findMany({
    where: { estado: 'Pendiente', fecha_expiracion: { lt: new Date() } },
    select: CAMPOS,
  });

export const registrarEvento = (
  tx: ClientePrisma,
  datos: { idPago: number; tipo: string; origen: string; cuerpo: string },
) =>
  tx.evento_pago.create({
    data: {
      id_pago: datos.idPago,
      tipo: datos.tipo,
      origen: datos.origen,
      // El cuerpo se guarda recortado: una pasarela puede enviar mucho y esto
      // es una bitácora para reconstruir un reclamo, no un archivo de datos.
      cuerpo: datos.cuerpo.slice(0, 4000),
    },
    select: { id_evento: true },
  });

export const eventosDe = (idPago: number) =>
  prisma.evento_pago.findMany({
    where: { id_pago: idPago },
    orderBy: { recibido_en: 'asc' },
    select: { id_evento: true, tipo: true, origen: true, recibido_en: true },
  });

export type PagoConsultado = NonNullable<Awaited<ReturnType<typeof buscarPorId>>>;
