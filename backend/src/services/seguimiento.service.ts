import * as pedidoModel from '../models/pedido.model.js';
import * as posicionModel from '../models/posicion.model.js';
import { exigirCliente, exigirEmpleado } from './actor.service.js';
import { ErrorApp } from '../errors/error-app.js';
import type { ClientePrisma } from '../models/stock.model.js';
import type { DatosPosicion, SeguimientoDTO } from '../dtos/seguimiento.dto.js';

/**
 * Seguimiento del repartidor en vivo (RF-PED-08, estado En camino).
 *
 * El teléfono del repartidor informa dónde está mientras lleva un pedido, y
 * quien lo espera —el cliente y el personal— lo ve en el mapa de la
 * aplicación, sin salir a otra: así se sabe si de verdad viene en camino.
 *
 * Tres límites, los tres a propósito:
 *
 * - **Solo con un pedido En camino.** Antes, el pedido todavía está en el
 *   local; después, ya no hay nada que seguir. Fuera de ese tramo el
 *   servidor rechaza la posición y no la muestra.
 * - **Sin recorrido.** Se guarda la última posición, una fila por repartidor
 *   que se pisa: el sistema necesita saber dónde está, no por dónde anduvo.
 * - **Se olvida al terminar.** Cerrar su última entrega borra la posición.
 */

export async function informarPosicion(idUsuario: number, datos: DatosPosicion): Promise<void> {
  const idEmpleado = await exigirEmpleado(idUsuario, 'compartir su ubicación');

  if ((await pedidoModel.cuantosEnCamino(idEmpleado)) === 0) {
    // Una posición que quedara de antes tampoco tiene por qué seguir guardada.
    await posicionModel.borrar(idEmpleado);
    throw new ErrorApp(409, 'La ubicación se comparte solo mientras lleva un pedido en camino');
  }

  await posicionModel.guardar(idEmpleado, {
    latitud: datos.latitud,
    longitud: datos.longitud,
    precision: datos.precision ?? null,
  });
}

/** El repartidor deja de compartir: su posición se olvida enseguida. */
export async function dejarDeCompartir(idUsuario: number): Promise<void> {
  const idEmpleado = await exigirEmpleado(idUsuario, 'compartir su ubicación');
  await posicionModel.borrar(idEmpleado);
}

/**
 * Al cerrar una entrega: si el repartidor ya no lleva ningún pedido en la
 * calle, su posición se borra. Va dentro de la transacción del cierre, para
 * que no quede una ubicación guardada de alguien que ya no está repartiendo.
 */
export async function olvidarSiTermino(idRepartidor: number, tx: ClientePrisma): Promise<void> {
  if ((await pedidoModel.cuantosEnCamino(idRepartidor, tx)) === 0) {
    await posicionModel.borrar(idRepartidor, tx);
  }
}

/**
 * El cliente sigue **su** pedido.
 *
 * Un pedido ajeno se responde como inexistente, igual que en el detalle: no
 * se confirma siquiera que exista, y menos dónde está quien lo lleva.
 */
export async function paraCliente(idUsuario: number, idPedido: number): Promise<SeguimientoDTO> {
  const idCliente = await exigirCliente(idUsuario, 'seguir sus pedidos');
  const reparto = await pedidoModel.repartoDe(idPedido);
  if (!reparto || reparto.id_cliente !== idCliente) {
    throw new ErrorApp(404, 'Pedido no encontrado');
  }
  return seguimientoDe(reparto);
}

/** El personal sigue cualquier pedido: el mismo alcance que el tablero. */
export async function paraPersonal(idUsuario: number, idPedido: number): Promise<SeguimientoDTO> {
  await exigirEmpleado(idUsuario, 'gestionar los pedidos');
  const reparto = await pedidoModel.repartoDe(idPedido);
  if (!reparto) throw new ErrorApp(404, 'Pedido no encontrado');
  return seguimientoDe(reparto);
}

async function seguimientoDe(
  reparto: NonNullable<Awaited<ReturnType<typeof pedidoModel.repartoDe>>>,
): Promise<SeguimientoDTO> {
  if (reparto.estado_pedido !== 'En camino' || reparto.id_repartidor === null) {
    return { enCamino: false, repartidor: null, posicion: null };
  }

  const posicion = await posicionModel.deEmpleado(reparto.id_repartidor);
  return {
    enCamino: true,
    repartidor: reparto.empleado?.usuario.nombre ?? null,
    posicion: posicion && {
      latitud: Number(posicion.latitud),
      longitud: Number(posicion.longitud),
      precision: posicion.precision_m === null ? null : Number(posicion.precision_m),
      actualizadaEn: posicion.actualizada_en.toISOString(),
      antiguedadSegundos: Math.max(
        0,
        Math.round((Date.now() - posicion.actualizada_en.getTime()) / 1000),
      ),
    },
  };
}
