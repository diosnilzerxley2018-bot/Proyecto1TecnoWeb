import * as empleadoModel from '../models/empleado.model.js';
import * as pedidoModel from '../models/pedido.model.js';
import { CARGO_REPARTIDOR, ESTADOS_OCUPAN_REPARTIDOR } from '../config/dominio.js';

/**
 * RF-PED-07 — a quién le toca la próxima entrega.
 *
 * Vive aparte de `pedido-gestion.service` porque **tres caminos distintos lo
 * necesitan** y dos de ellos no se conocen entre sí: el pedido en efectivo, que
 * nace listo para repartir; el pedido en línea, que lo está recién cuando el
 * cobro se confirma —y eso ocurre dentro del servicio de pagos—; y el tablero
 * del personal, que lo usa para sugerir. Ponerlo en cualquiera de ellos
 * obligaba a que los otros lo importaran y cerraba un círculo de dependencias.
 */

/** Repartidores ordenados por quién debería tomar la próxima entrega. */
export const repartidoresPorPrioridad = () =>
  empleadoModel.repartidoresPorCarga(CARGO_REPARTIDOR, ESTADOS_OCUPAN_REPARTIDOR);

export type RepartidorPriorizado = Awaited<ReturnType<typeof repartidoresPorPrioridad>>[number];

/**
 * El siguiente repartidor, o `null` si no hay ninguno de turno.
 *
 * El orden lo pone el modelo y es el del reparto equitativo: primero quien
 * menos entregas tiene en curso —los libres van delante—, y entre los que
 * están igual de cargados, el que antes se va a liberar.
 *
 * Solo entran los que **declararon estar de turno**. Repartir a quien no está
 * trabajando no es repartir: es perder el pedido.
 */
export async function siguienteRepartidor(): Promise<RepartidorPriorizado | null> {
  const repartidores = await repartidoresPorPrioridad();
  return repartidores.find((r) => r.disponible) ?? null;
}

/**
 * Le asigna repartidor a un pedido que no lo tiene (RF-PED-07).
 *
 * Se llama cuando el pedido queda listo para repartir. Antes esto era siempre
 * manual: el pedido entraba y se quedaba esperando a que alguien del mostrador
 * se acordara de asignarlo, aunque hubiera un repartidor libre y de turno.
 *
 * **No pisa una asignación existente** ni falla si no hay nadie de turno: en
 * ese caso el pedido queda sin repartidor y el tablero lo asigna a mano, como
 * hasta ahora. Devuelve a quién le tocó, o `null` si no le tocó a nadie.
 */
export async function asignarAutomaticamente(
  idPedido: number,
): Promise<RepartidorPriorizado | null> {
  const pedido = await pedidoModel.buscarPorId(idPedido);
  if (!pedido || pedido.id_repartidor !== null) return null;

  // Solo al entrar a la cola. Un pedido que ya avanzó, o que se cancelo
  // mientras se resolvía el cobro, no necesita repartidor.
  if (pedido.estado_pedido !== 'Recibido') return null;

  const elegido = await siguienteRepartidor();
  if (!elegido) return null;

  await pedidoModel.asignarRepartidor(idPedido, elegido.idEmpleado);
  return elegido;
}

/**
 * Igual que la anterior, pero **nunca corta al que la llama**.
 *
 * Asignar es una comodidad, no parte de confirmar el pedido: si fallara, el
 * pedido igual existe y el mostrador puede asignarlo a mano. Lo que no puede
 * pasar es que un tropiezo aquí haga fracasar un pedido ya pagado. El fallo se
 * registra, que es lo que faltó en otros puntos de este mismo flujo.
 */
export async function asignarSinRomper(idPedido: number): Promise<RepartidorPriorizado | null> {
  try {
    return await asignarAutomaticamente(idPedido);
  } catch (error) {
    console.error(
      `[reparto] No se pudo asignar repartidor al pedido ${idPedido}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
