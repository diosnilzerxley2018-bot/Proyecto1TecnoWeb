import { prisma } from '../config/prisma.js';
import * as pedidoModel from '../models/pedido.model.js';
import type { PedidoConDetalle } from '../models/pedido.model.js';
import type { ClientePrisma } from '../models/stock.model.js';
import {
  verificarDisponibilidad,
  descontarAsignaciones,
  reponerAsignaciones,
  type Asignacion,
} from './stock.service.js';
import type {
  DatosConfirmarPedido,
  EstadoPedido,
  MetodoPago,
  PedidoDetalleDTO,
} from '../dtos/pedido.dto.js';
import { ErrorApp } from '../errors/error-app.js';
import { esCancelable, requiereCobroEnLinea } from '../config/dominio.js';
import { exigirCliente } from './actor.service.js';
import * as ubicacionService from './ubicacion.service.js';
import * as pagoService from './pago.service.js';
import * as avisoService from './aviso.service.js';
import * as repartoService from './reparto.service.js';
import * as usuarioModel from '../models/usuario.model.js';
import { modoCobro } from './configuracion.service.js';
import { aDetalleDTO, calcularTotal } from './pedido.mapper.js';

/**
 * CU-PED-02 — Gestionar Pedido (lado del cliente), con las inclusiones
 * Verificar Disponibilidad de Stock (CU-INV-06) y Gestionar Ubicación
 * (CU-PED-03), y la extensión Pagar Pedido en Línea (CU-PED-04).
 *
 * El lado del empleado —avance de estados y asignación de repartidor— vive en
 * `pedido-gestion.service.ts`: mismo caso de uso, otro actor y otro alcance de
 * datos (este servicio nunca ve pedidos ajenos al cliente autenticado).
 */

/**
 * CU-PED-04 — Pagar Pedido en Línea.
 *
 * Antes, un método distinto de efectivo daba el pedido por pagado en el acto,
 * confiando en una referencia que el propio navegador del cliente escribía. Es
 * decir: cualquiera podía escribir cuatro caracteres y llevarse la comida. Ese
 * camino se retiró.
 *
 * Ahora el pago en línea deja el pedido **esperando a la pasarela**: el stock
 * queda reservado, pero el pedido no entra a la cocina hasta que el cobro se
 * confirma. El efectivo sigue igual —se paga contra entrega— porque ahí no hay
 * nada que verificar todavía.
 */
function estadosIniciales(metodoPago: MetodoPago): { estadoPedido: string; estadoPago: string } {
  return requiereCobroEnLinea(metodoPago)
    ? { estadoPedido: 'Pendiente de pago', estadoPago: 'Pendiente' }
    : { estadoPedido: 'Recibido', estadoPago: 'Pendiente' };
}

function asignacionesDelPedido(pedido: PedidoConDetalle): Asignacion[] {
  return pedido.detalle_pedido.map((d) => ({
    idProducto: d.id_producto,
    idAlmacen: d.id_almacen,
    cantidad: d.cantidad,
  }));
}

/**
 * Agrupa las líneas repetidas del carrito. Sin esto, pedir dos veces el mismo
 * producto produciría dos filas con la misma clave primaria en el detalle.
 */
function consolidarItems(items: DatosConfirmarPedido['items']) {
  const porProducto = new Map<number, number>();
  for (const item of items) {
    porProducto.set(item.idProducto, (porProducto.get(item.idProducto) ?? 0) + item.cantidad);
  }
  return [...porProducto].map(([idProducto, cantidad]) => ({ idProducto, cantidad }));
}

/**
 * Confirma un pedido en una sola transacción.
 *
 * Si cualquier paso falla —stock insuficiente, producto dado de baja, carrera
 * con otro pedido— se revierte todo y el inventario queda intacto.
 */
export async function confirmar(
  idUsuario: number,
  datos: DatosConfirmarPedido,
): Promise<PedidoDetalleDTO> {
  const idCliente = await exigirCliente(idUsuario, 'gestionar pedidos');
  const items = consolidarItems(datos.items);

  const modo = await modoCobro();

  const resultado = await prisma.$transaction(async (tx: ClientePrisma) => {
    // «include» Verificar Disponibilidad de Stock — resuelve el almacén de origen.
    const asignaciones = await verificarDisponibilidad(items, tx);

    const precios = await pedidoModel.preciosVigentes(
      items.map((i) => i.idProducto),
      tx,
    );
    const precioDe = new Map(precios.map((p) => [p.id_producto, Number(p.precio_venta)]));

    const inactivos = items.filter((i) => !precioDe.has(i.idProducto));
    if (inactivos.length > 0) {
      const codigos = inactivos.map((i) => i.idProducto).join(', ');
      throw new ErrorApp(409, `Hay productos que ya no están disponibles: ${codigos}`);
    }

    const total = calcularTotal(
      items.map((i) => ({ cantidad: i.cantidad, precioUnitario: precioDe.get(i.idProducto)! })),
    );

    // «include» Gestionar Ubicación — toda entrega necesita una dirección.
    // «include» Gestionar Ubicación — resuelve una dirección guardada o crea
    // la que el cliente escribió recién.
    const idUbicacion = await ubicacionService.resolverDestino(tx, idCliente, datos.ubicacion);

    const estados = estadosIniciales(datos.metodoPago);

    const pedido = await pedidoModel.crear(tx, {
      idCliente,
      idUbicacion,
      metodoPago: datos.metodoPago,
      estadoPedido: estados.estadoPedido,
      estadoPago: estados.estadoPago,
      // La referencia ya no la escribe el cliente: la pone la pasarela al
      // abrir el cobro, si es que llega a haber uno.
      referenciaPago: null,
      total,
    });

    await pedidoModel.crearDetalle(
      tx,
      asignaciones.map((a) => ({
        id_pedido: pedido.id_pedido,
        id_producto: a.idProducto,
        id_almacen: a.idAlmacen,
        cantidad: a.cantidad,
        precio_unitario: precioDe.get(a.idProducto)!,
      })),
    );

    await descontarAsignaciones(asignaciones, tx);

    const idPago = await pagoService.registrarCobroEnTransaccion(tx, {
      monto: total,
      metodo: datos.metodoPago,
      modo,
      idPedido: pedido.id_pedido,
    });

    return { idPedido: pedido.id_pedido, idPago };
  });

  const pedido = await detalle(idUsuario, resultado.idPedido);

  if (requiereCobroEnLinea(datos.metodoPago)) {
    pedido.cobro = await abrirCobroDelPedido(resultado.idPago, resultado.idPedido);
  } else {
    pedido.cobro = await pagoService.dePedido(resultado.idPedido);
    /*
     * El pedido en efectivo nace listo para repartir, así que se le busca
     * repartidor ahora mismo (RF-PED-07). El pagado en línea no: entra a la
     * cola recién cuando el cobro se confirma, y de eso se encarga el
     * servicio de pagos.
     */
    await repartoService.asignarSinRomper(resultado.idPedido);
  }

  // El aviso se manda aunque el cobro siga pendiente: el cliente necesita
  // saber que su pedido existe, y esa es información aparte de si ya pagó.
  const titular = await usuarioModel.buscarPorId(idUsuario);
  if (titular) {
    avisoService.enSegundoPlano(
      avisoService.pedidoConfirmado({
        id: pedido.id,
        correoCliente: titular.email,
        nombreCliente: titular.nombre,
        total: pedido.total,
      }),
    );
  }

  return pedido;
}

/**
 * Abre el cobro y guarda su identificador en el pedido.
 *
 * Si la pasarela falla, el pedido queda en `Pendiente de pago` con el cobro en
 * `Fallido`: el cliente puede reintentar y, si nunca lo hace, el vencimiento
 * lo cancela y devuelve el stock. Es preferible a perder el pedido entero por
 * una caída ajena.
 */
async function abrirCobroDelPedido(idPago: number, idPedido: number) {
  try {
    const cobro = await pagoService.abrirCobro(idPago, {
      descripcion: `NutriExpress - Pedido ${idPedido}`,
      referenciaInterna: `PEDIDO-${idPedido}`,
    });
    await pedidoModel.registrarReferenciaPago(idPedido, cobro.referenciaExterna);
    return cobro;
  } catch {
    return pagoService.dePedido(idPedido);
  }
}

/**
 * CU-PED-02 — «Mis pedidos».
 *
 * Devuelve el pedido **completo**, no un resumen. El portal presenta cada
 * pedido como una ficha desplegable con su dirección y sus platos, de modo que
 * un listado recortado lo obligaría a pedir el detalle de cada fila por
 * separado: N+1 peticiones para pintar una sola pantalla.
 *
 * No cuesta una consulta más: `listarDeCliente` ya trae la ubicación y el
 * detalle en el mismo `include`, así que recortarlo aquí era pagar el viaje a
 * la base y tirar el resultado. Es además lo que ya hace el tablero del
 * personal (`pedido-gestion.service.listar`), y las dos vistas del mismo caso
 * de uso no tienen por qué contestar cosas distintas.
 */
export async function listar(idUsuario: number): Promise<PedidoDetalleDTO[]> {
  const idCliente = await exigirCliente(idUsuario, 'gestionar pedidos');
  const pedidos = await pedidoModel.listarDeCliente(idCliente);
  return pedidos.map(aDetalleDTO);
}

/**
 * Pedido individual, **con su cobro**.
 *
 * El cobro se adjunta aquí y no en el listado por dos razones: dibujar el QR
 * cuesta, y de una lista de pedidos solo uno suele estar esperando pago.
 *
 * Que se adjunte es lo que permite retomar un pago interrumpido. Antes el QR
 * se entregaba una sola vez, al confirmar; si el cliente cerraba la pestaña no
 * había forma de recuperarlo y solo le quedaba esperar a que el pedido
 * venciera. El cobro ya estaba en la base: lo que faltaba era devolverlo.
 */
export async function detalle(idUsuario: number, idPedido: number): Promise<PedidoDetalleDTO> {
  const idCliente = await exigirCliente(idUsuario, 'gestionar pedidos');
  const pedido = await pedidoModel.buscarDeCliente(idPedido, idCliente);
  if (!pedido) throw new ErrorApp(404, 'El pedido no existe');

  const dto = aDetalleDTO(pedido);
  dto.cobro = await pagoService.dePedido(idPedido);
  return dto;
}

/**
 * Cancela un pedido y repone el stock descontado (CU-PED-02, excepciones).
 * Solo es posible mientras el pedido no haya pasado al estado En camino.
 */
export async function cancelar(idUsuario: number, idPedido: number): Promise<PedidoDetalleDTO> {
  const idCliente = await exigirCliente(idUsuario, 'gestionar pedidos');

  await prisma.$transaction(async (tx: ClientePrisma) => {
    const pedido = await pedidoModel.buscarDeCliente(idPedido, idCliente, tx);
    if (!pedido) throw new ErrorApp(404, 'El pedido no existe');

    const estado = pedido.estado_pedido as EstadoPedido;
    if (!esCancelable(estado)) {
      throw new ErrorApp(409, `No es posible cancelar un pedido en estado ${estado}`);
    }

    await reponerAsignaciones(asignacionesDelPedido(pedido), tx);
    await pedidoModel.cambiarEstado(tx, idPedido, 'Cancelado');
  });

  return detalle(idUsuario, idPedido);
}
