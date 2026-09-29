import * as pedidoModel from '../models/pedido.model.js';
import * as pagoModel from '../models/pago.model.js';
import type {
  ComprobantePedidoDTO,
  EnvioComprobanteDTO,
  MetodoPago,
} from '../dtos/pedido.dto.js';
import { ErrorApp } from '../errors/error-app.js';
import { exigirCliente } from './actor.service.js';
import * as negocioService from './negocio.service.js';
import * as avisoService from './aviso.service.js';
import { comprobanteEnPdf } from './comprobante-pdf.service.js';
import { aDetalleDTO } from './pedido.mapper.js';

/**
 * El comprobante del pedido pagado (RF-VEN-06 llevado al portal).
 *
 * El cliente que pagaba en el mostrador se iba con su comprobante; el que
 * pagaba su pedido en línea no recibía ninguna constancia. Aquí se arma el
 * mismo comprobante —en pantalla, en PDF y por correo— a partir del pedido y
 * de su cobro, sin tabla propia, como el de la venta.
 *
 * Solo existe para un pedido **pagado**: es la constancia de un pago, no un
 * resumen del pedido. Y solo lo ve el cliente dueño del pedido: uno ajeno se
 * responde como inexistente, igual que el detalle.
 */

type PedidoParaComprobante = NonNullable<Awaited<ReturnType<typeof pedidoModel.buscarPorId>>>;

const numeroDe = (id: number) => `Pedido #${String(id).padStart(5, '0')}`;

async function armar(pedido: PedidoParaComprobante): Promise<ComprobantePedidoDTO> {
  const [pago, negocio] = await Promise.all([
    pagoModel.buscarDePedido(pedido.id_pedido),
    negocioService.informacion(),
  ]);
  const { items } = aDetalleDTO(pedido);
  const u = pedido.ubicacion;
  const efectivo = pedido.metodo_pago === 'Efectivo';

  return {
    numero: numeroDe(pedido.id_pedido),
    fecha: pedido.fecha.toISOString(),
    // En efectivo el pago se confirma al entregar (`avanzarEstado`).
    pagadoEn: (pago?.fecha_confirmacion ?? pedido.fecha_entrega)?.toISOString() ?? null,
    cliente: `${pedido.cliente.usuario.nombre} ${pedido.cliente.usuario.apellido}`.trim(),
    entrega: [`${u.calle} ${u.numero ?? ''}`.trim(), u.referencia].filter(Boolean).join(' · '),
    metodoPago: pedido.metodo_pago as MetodoPago,
    referenciaPago: efectivo ? null : (pago?.id_transaccion_ext ?? pedido.referencia_pago),
    detalle: items,
    cantidadItems: items.reduce((suma, l) => suma + l.cantidad, 0),
    total: Number(pedido.total),
    soporte: negocio.correo,
  };
}

/** El pedido del cliente, pagado; si no, el error que corresponde. */
async function pedidoPagadoDe(idUsuario: number, idPedido: number): Promise<PedidoParaComprobante> {
  const idCliente = await exigirCliente(idUsuario, 'consultar sus comprobantes');
  const pedido = await pedidoModel.buscarPorId(idPedido);
  if (!pedido || pedido.cliente.id_cliente !== idCliente) {
    throw new ErrorApp(404, 'El pedido no existe');
  }
  if (pedido.estado_pago !== 'Pagado') {
    throw new ErrorApp(
      409,
      pedido.metodo_pago === 'Efectivo'
        ? 'El comprobante se emite al pagar: en efectivo, cuando recibe su pedido.'
        : 'El comprobante se emite cuando el pago se confirma.',
    );
  }
  return pedido;
}

export async function paraCliente(idUsuario: number, idPedido: number): Promise<ComprobantePedidoDTO> {
  return armar(await pedidoPagadoDe(idUsuario, idPedido));
}

export async function pdfParaCliente(idUsuario: number, idPedido: number): Promise<Buffer> {
  return comprobanteEnPdf(await paraCliente(idUsuario, idPedido));
}

async function enviar(
  pedido: PedidoParaComprobante,
  ocasion: avisoService.OcasionComprobante,
): Promise<EnvioComprobanteDTO> {
  const comprobante = await armar(pedido);
  const para = pedido.cliente.usuario.email;
  const resultado = await avisoService.comprobanteDePedido({
    correo: para,
    nombre: pedido.cliente.usuario.nombre,
    comprobante,
    adjunto: {
      nombre: `comprobante-pedido-${String(pedido.id_pedido).padStart(5, '0')}.pdf`,
      contenido: await comprobanteEnPdf(comprobante),
      tipo: 'application/pdf',
    },
    ocasion,
  });
  return { enviado: resultado.enviado, para, ...(resultado.motivo ? { motivo: resultado.motivo } : {}) };
}

/**
 * El cliente pide su comprobante por correo desde «Mis pedidos».
 *
 * Va siempre al correo de su cuenta, nunca a uno que venga en la petición:
 * si no, el botón serviría para mandar correos a cualquiera en nombre del
 * negocio.
 */
export async function enviarAlCliente(idUsuario: number, idPedido: number): Promise<EnvioComprobanteDTO> {
  return enviar(await pedidoPagadoDe(idUsuario, idPedido), 'pedido');
}

/**
 * Lo manda solo, apenas el pedido queda pagado: al confirmarse el pago en
 * línea o al entregarse en efectivo.
 *
 * Nunca lanza —un correo que no sale no deshace un pago— y quien la llama no
 * la espera (`avisoService.enSegundoPlano`).
 */
export async function enviarAlPagar(
  idPedido: number,
  ocasion: Exclude<avisoService.OcasionComprobante, 'pedido'>,
): Promise<void> {
  const pedido = await pedidoModel.buscarPorId(idPedido);
  if (!pedido || pedido.estado_pago !== 'Pagado') return;
  const resultado = await enviar(pedido, ocasion);
  if (!resultado.enviado) {
    console.error(`[comprobante] no salió el del pedido ${idPedido}: ${resultado.motivo ?? 'sin motivo'}`);
  }
}
