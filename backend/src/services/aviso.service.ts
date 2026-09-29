import { mensajero, type Adjunto, type ResultadoEnvio } from '../correo/index.js';
import type { EstadoPedido } from '../config/dominio.js';
import type { ComprobantePedidoDTO } from '../dtos/pedido.dto.js';
import { bolivianos } from '../utils/dinero.js';
import * as negocioService from './negocio.service.js';

/**
 * Avisos por correo (RF-PED-08 y los RF de reportes).
 *
 * Un sistema de escritorio registra y espera a que alguien mire; uno web
 * **alcanza a la persona donde está**. Estos avisos son la diferencia entre un
 * cliente que refresca la pantalla para saber si su pedido salió, y uno que se
 * entera solo.
 *
 * **Regla que gobierna el archivo: un aviso nunca rompe la operación.** Todas
 * las funciones devuelven en lugar de lanzar, y quien las llama no espera el
 * resultado. Que el servidor de correo esté caído no puede impedir que un
 * pedido se registre.
 */

const NOMBRE = 'NutriExpress';

/** Envuelve el cuerpo en una plantilla sobria, legible en cualquier cliente. */
function plantilla(titulo: string, cuerpo: string, pie?: string): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f5f5f4;font-family:system-ui,-apple-system,sans-serif;color:#1c1917">
  <div style="max-width:34rem;margin:0 auto;padding:2rem 1.25rem">
    <p style="margin:0 0 1.5rem;font-size:1.05rem;font-weight:600;color:#ea580c">${NOMBRE}</p>
    <h1 style="margin:0 0 1rem;font-size:1.3rem;font-weight:600;line-height:1.3">${titulo}</h1>
    <div style="font-size:.95rem;line-height:1.6;color:#44403c">${cuerpo}</div>
    ${
      pie
        ? `<p style="margin:2rem 0 0;padding-top:1rem;border-top:1px solid #e7e5e4;font-size:.8rem;color:#78716c">${pie}</p>`
        : ''
    }
  </div>
</body></html>`;
}

export interface DatosPedidoAviso {
  id: number;
  correoCliente: string;
  nombreCliente: string;
  total: number;
  /** Cambia lo que hay que decirle: en efectivo, cuánto tener listo y si se cobró. */
  metodoPago: string;
  /** Si el dinero ya se cobró: en línea al confirmar, en efectivo al entregar. */
  pagado: boolean;
}

const numeroDe = (id: number) => `#${String(id).padStart(5, '0')}`;

/**
 * El correo de soporte del negocio (RF-PED-03, editable por el administrador).
 *
 * Va como dirección de respuesta de todo correo al cliente: el remitente es la
 * cuenta que envía, que nadie lee. Si no se puede leer la configuración, el
 * aviso sale igual, sin dirección de respuesta: un aviso nunca se detiene.
 */
async function soporte(): Promise<string | undefined> {
  try {
    return (await negocioService.informacion()).correo;
  } catch {
    return undefined;
  }
}

/**
 * Cómo se le explica cada estado a quien espera su pedido.
 *
 * Es una función y no una tabla fija porque el mensaje depende de cómo paga:
 * a quien paga en efectivo hay que recordarle cuánto tener listo, y a quien no
 * se le pudo entregar hay que decirle si se le cobró algo.
 */
function avisoDeEstado(
  estado: EstadoPedido,
  datos: DatosPedidoAviso,
): { asunto: string; cuerpo: string } | null {
  const efectivo = datos.metodoPago === 'Efectivo';

  switch (estado) {
    case 'En preparacion':
      return {
        asunto: 'Estamos preparando su pedido',
        cuerpo: 'Su pedido entró a la cocina. Le avisamos de nuevo cuando salga para su dirección.',
      };
    case 'En camino':
      return {
        asunto: 'Su pedido va en camino',
        cuerpo:
          'Su pedido salió y está en camino a la dirección que indicó. Ya falta poco.' +
          (efectivo && !datos.pagado
            ? ` Tenga listos ${bolivianos(datos.total)} para pagarle al repartidor.`
            : ''),
      };
    case 'Entregado':
      return {
        asunto: 'Su pedido fue entregado',
        cuerpo:
          '¡Buen provecho! Gracias por elegirnos.' +
          (efectivo ? ` Pagó ${bolivianos(datos.total)} en efectivo al recibirlo.` : ''),
      };
    /*
     * Desde el tablero, un pedido solo se cancela cuando el repartidor no pudo
     * entregarlo. Antes llegaba como "Su pedido fue cancelado", y quien lo
     * esperaba entendía que alguien lo había anulado —quizá él mismo por error—
     * en vez de saber que el repartidor fue y no pudo dejarlo.
     */
    case 'Cancelado':
      return {
        asunto: 'No pudimos entregar su pedido',
        cuerpo:
          'Nuestro repartidor fue a la dirección que indicó y no pudo entregar el pedido, ' +
          'así que quedó cancelado. ' +
          (datos.pagado
            ? 'Como ya lo había pagado en línea, el reembolso se gestiona por separado. '
            : 'No se le cobró nada. ') +
          'Puede volver a pedirlo desde el portal cuando quiera.',
      };
    default:
      return null;
  }
}

/**
 * Avisa que el pedido quedó registrado.
 *
 * Se dispara al confirmar, no al pagar: el cliente necesita saber que su
 * pedido existe aunque el cobro siga pendiente.
 */
export async function pedidoConfirmado(datos: DatosPedidoAviso): Promise<void> {
  const numero = numeroDe(datos.id);
  const efectivo = datos.metodoPago === 'Efectivo';

  await mensajero().enviar({
    // Un aviso de pedido es personal: un solo destinatario.
    para: [datos.correoCliente],
    responderA: await soporte(),
    asunto: `Recibimos su pedido ${numero}`,
    texto:
      `Hola ${datos.nombreCliente}:\n\n` +
      `Recibimos su pedido ${numero} por ${bolivianos(datos.total)}.\n` +
      (efectivo ? `Lo paga en efectivo al recibirlo: tenga listos ${bolivianos(datos.total)}.\n` : '') +
      'Le vamos a avisar cuando entre a la cocina y cuando salga para su dirección.\n\n' +
      `${NOMBRE}`,
    html: plantilla(
      `Recibimos su pedido ${numero}`,
      `<p>Hola ${datos.nombreCliente}, su pedido por <strong>${bolivianos(datos.total)}</strong> quedó registrado.</p>
       ${efectivo ? `<p>Lo paga <strong>en efectivo al recibirlo</strong>: tenga listos ${bolivianos(datos.total)}.</p>` : ''}
       <p>Le avisamos cuando entre a la cocina y cuando salga para su dirección.</p>`,
      'Este es un aviso automático; no hace falta responderlo.',
    ),
  });
}

/**
 * Avisa que el pedido cambió de estado.
 *
 * No todos los estados generan aviso: `Recibido` ya se comunicó al confirmar, y
 * `Pendiente de pago` es un trámite interno que al cliente no le dice nada.
 */
export async function estadoDePedidoCambio(
  datos: DatosPedidoAviso,
  estado: EstadoPedido,
): Promise<void> {
  const aviso = avisoDeEstado(estado, datos);
  if (!aviso) return;

  const numero = numeroDe(datos.id);

  await mensajero().enviar({
    // Un aviso de pedido es personal: un solo destinatario.
    para: [datos.correoCliente],
    responderA: await soporte(),
    asunto: `${aviso.asunto} · ${numero}`,
    texto: `Hola ${datos.nombreCliente}:\n\n${aviso.cuerpo}\n\nPedido ${numero}\n\n${NOMBRE}`,
    html: plantilla(
      aviso.asunto,
      `<p>Hola ${datos.nombreCliente}:</p><p>${aviso.cuerpo}</p>
       <p style="color:#78716c">Pedido ${numero}</p>`,
      'Este es un aviso automático; no hace falta responderlo.',
    ),
  });
}

/**
 * Por qué se manda el comprobante, que cambia el asunto y la primera frase.
 *
 * - `pago`: el cliente pagó en línea (QR o tarjeta) y el cobro se confirmó.
 * - `entrega`: pagó en efectivo al recibir; reemplaza al aviso de entregado,
 *   para no mandarle dos correos por lo mismo.
 * - `pedido`: lo pidió él desde «Mis pedidos».
 */
export type OcasionComprobante = 'pago' | 'entrega' | 'pedido';

/**
 * Manda el comprobante de un pedido pagado, con el PDF adjunto.
 *
 * Devuelve el resultado en vez de descartarlo: cuando lo pide el cliente, la
 * pantalla le dice si salió. Cuando se dispara solo, va en segundo plano.
 */
export async function comprobanteDePedido(datos: {
  correo: string;
  nombre: string;
  comprobante: ComprobantePedidoDTO;
  adjunto: Adjunto;
  ocasion: OcasionComprobante;
}): Promise<ResultadoEnvio> {
  const c = datos.comprobante;
  const total = bolivianos(c.total);
  const { asunto, primera } = {
    pago: {
      asunto: `Comprobante de pago · Pedido ${c.numero.replace('Pedido ', '')}`,
      primera: `Recibimos su pago de <strong>${total}</strong> con ${c.metodoPago}. Su pedido ya pasa a preparación.`,
    },
    entrega: {
      asunto: `Su pedido fue entregado · ${c.numero.replace('Pedido ', '')}`,
      primera: `¡Buen provecho! Gracias por elegirnos. Pagó <strong>${total}</strong> en efectivo al recibirlo.`,
    },
    pedido: {
      asunto: `Comprobante del ${c.numero.toLowerCase()}`,
      primera: `Aquí tiene el comprobante de su pedido por <strong>${total}</strong>.`,
    },
  }[datos.ocasion];

  const lineas = c.detalle
    .map(
      (l) =>
        `<tr><td style="padding:.25rem 0">${l.cantidad} × ${l.nombre}</td>` +
        `<td style="padding:.25rem 0;text-align:right;white-space:nowrap">${bolivianos(l.subtotal)}</td></tr>`,
    )
    .join('');

  return mensajero().enviar({
    para: [datos.correo],
    responderA: c.soporte,
    asunto,
    texto:
      `Hola ${datos.nombre}:\n\n${primera.replace(/<[^>]+>/g, '')}\n\n` +
      c.detalle.map((l) => `${l.cantidad} x ${l.nombre}: ${bolivianos(l.subtotal)}`).join('\n') +
      `\nTotal: ${total}\n\nEl comprobante va adjunto en PDF.\n` +
      `¿Dudas? Responda este correo o escríbanos a ${c.soporte}.\n\n${NOMBRE}`,
    html: plantilla(
      asunto,
      `<p>Hola ${datos.nombre}:</p><p>${primera}</p>
       <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin:1rem 0">${lineas}
         <tr><td style="padding:.5rem 0;border-top:1px solid #e7e5e4;font-weight:600">Total</td>
             <td style="padding:.5rem 0;border-top:1px solid #e7e5e4;text-align:right;font-weight:600">${total}</td></tr>
       </table>
       <p>El comprobante va adjunto en PDF.</p>`,
      `¿Dudas? Responda este correo o escríbanos a ${c.soporte}.`,
    ),
    adjuntos: [datos.adjunto],
  });
}

/** Envía un reporte ya generado, como adjunto. */
export async function reporte(datos: {
  /** Uno o varios: un reporte se manda a quien lo necesita. */
  para: string[];
  titulo: string;
  descripcion: string;
  adjunto: Adjunto;
}): Promise<{ enviado: boolean; motivo?: string }> {
  const resultado = await mensajero().enviar({
    para: datos.para,
    asunto: `${datos.titulo} · ${NOMBRE}`,
    texto: `${datos.descripcion}\n\nEl reporte va adjunto en formato PDF.\n\n${NOMBRE}`,
    html: plantilla(
      datos.titulo,
      `<p>${datos.descripcion}</p><p>El reporte va adjunto en formato PDF.</p>`,
    ),
    adjuntos: [datos.adjunto],
  });

  return { enviado: resultado.enviado, motivo: resultado.motivo };
}

/**
 * Dispara un aviso sin hacer esperar a quien lo pidió.
 *
 * Un correo puede tardar segundos; el cliente que confirmó su pedido no tiene
 * por qué esperarlos. Se lanza y se olvida, con el fallo registrado y nada más.
 */
export function enSegundoPlano(promesa: Promise<void>): void {
  void promesa.catch((error: unknown) => {
    console.error('[aviso] no se pudo enviar:', error);
  });
}
