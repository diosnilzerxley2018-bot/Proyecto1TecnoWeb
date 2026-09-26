import { prisma } from '../config/prisma.js';
import * as pedidoModel from '../models/pedido.model.js';
import { pagina, type Pagina } from '../dtos/paginacion.dto.js';
import * as empleadoModel from '../models/empleado.model.js';
import * as permisoModel from '../models/permiso.model.js';
import * as avisoService from './aviso.service.js';
import * as pagoService from './pago.service.js';
import * as repartoService from './reparto.service.js';
import * as seguimientoService from './seguimiento.service.js';
import { reponerAsignaciones } from './stock.service.js';
import type { ClientePrisma } from '../models/stock.model.js';
import type { PedidoParaGestion } from '../models/pedido.model.js';
import type {
  DisponibilidadDTO,
  EstadoPedido,
  FiltroPedidos,
  PedidoGestionDTO,
  RepartidorDTO,
  SugerenciaRepartidorDTO,
} from '../dtos/pedido.dto.js';
import { aDetalleDTO } from './pedido.mapper.js';
import {
  CARGO_REPARTIDOR,
  ESTADOS_OCUPAN_REPARTIDOR,
  esTransicionValida,
  transicionesPosibles,
} from '../config/dominio.js';
import { ErrorApp } from '../errors/error-app.js';
import { exigirEmpleado } from './actor.service.js';

/**
 * Permite cerrar la entrega de un pedido ajeno. Lo tiene solo el
 * administrador: es la llave para destrabar un pedido cuyo repartidor no está.
 */
const PERMISO_CERRAR_AJENO = 'PEDIDO_CERRAR_AJENO';

/**
 * CU-PED-02 — Gestionar Pedido, lado del empleado.
 *
 * Cubre RF-PED-07 (asignar repartidor) y RF-PED-08 (avanzar el estado según el
 * flujo recibido → en preparación → en camino → entregado). Es el mismo caso de
 * uso que atiende el portal del cliente, pero con otro actor: aquí se ven todos
 * los pedidos, no solo los propios.
 */

/** Estados en los que el pedido ya no admite cambios de asignación. */
const ESTADOS_TERMINALES: EstadoPedido[] = ['Entregado', 'Cancelado'];

function nombreCompleto(usuario: { nombre: string; apellido: string }): string {
  return `${usuario.nombre} ${usuario.apellido}`;
}

function aGestionDTO(pedido: PedidoParaGestion): PedidoGestionDTO {
  return {
    ...aDetalleDTO(pedido),
    cliente: {
      id: pedido.cliente.id_cliente,
      nombreCompleto: nombreCompleto(pedido.cliente.usuario),
      telefono: pedido.cliente.usuario.telefono,
    },
    repartidor: pedido.empleado
      ? {
          id: pedido.empleado.id_empleado,
          nombreCompleto: nombreCompleto(pedido.empleado.usuario),
        }
      : null,
    transicionesPosibles: transicionesPosibles(pedido.estado_pedido as EstadoPedido),
  };
}

async function obtenerPedido(idPedido: number): Promise<PedidoParaGestion> {
  const pedido = await pedidoModel.buscarPorId(idPedido);
  if (!pedido) throw new ErrorApp(404, 'El pedido no existe');
  return pedido;
}

export async function listar(
  idUsuario: number,
  filtro: FiltroPedidos,
): Promise<Pagina<PedidoGestionDTO>> {
  await exigirEmpleado(idUsuario, 'gestionar los pedidos');
  const [pedidos, total] = await pedidoModel.listarTodos(filtro);
  return pagina(pedidos.map(aGestionDTO), total, filtro);
}

/**
 * El tablero: cuántos pedidos hay en cada estado.
 *
 * Se responde aparte del listado porque son dos preguntas distintas —"¿cómo
 * está el día?" y "¿qué pedidos veo ahora?"— y mezclarlas obligaría a traer
 * todos los pedidos para poder contarlos.
 */
export async function contarPorEstado(
  idUsuario: number,
  filtro: { desde?: string; hasta?: string },
): Promise<Record<string, number>> {
  await exigirEmpleado(idUsuario, 'gestionar los pedidos');
  const filas = await pedidoModel.contarPorEstado(filtro);

  return Object.fromEntries(filas.map((f) => [f.estado_pedido, f._count._all]));
}

export async function detalle(idUsuario: number, idPedido: number): Promise<PedidoGestionDTO> {
  await exigirEmpleado(idUsuario, 'gestionar los pedidos');
  return aGestionDTO(await obtenerPedido(idPedido));
}

/**
 * Repartidores para asignar, con su carga actual (RF-PED-07).
 *
 * Vienen ordenados del menos cargado al más cargado, que es el orden en que
 * conviene ofrecerlos: el primero de la lista es el que el sistema sugeriría.
 */
export async function listarRepartidores(idUsuario: number): Promise<RepartidorDTO[]> {
  await exigirEmpleado(idUsuario, 'gestionar los pedidos');

  const repartidores = await empleadoModel.repartidoresPorCarga(
    CARGO_REPARTIDOR,
    ESTADOS_OCUPAN_REPARTIDOR,
  );

  return repartidores.map((r) => ({
    id: r.idEmpleado,
    nombreCompleto: r.nombreCompleto,
    telefono: r.telefono,
    disponible: r.disponible,
    entregasEnCurso: r.entregasEnCurso,
  }));
}

/**
 * Sugiere a quién asignarle el pedido. **No lo asigna.**
 *
 * La decisión sigue siendo de la persona que gestiona: un pedido a tres
 * cuadras conviene dárselo a quien ya sale para allá, aunque tenga una entrega
 * más. El sistema no sabe eso; quien está en el mostrador, sí.
 *
 * El criterio es el reparto equitativo: **el repartidor de turno con menos
 * entregas en curso**; a igualdad de carga, el que antes se va a liberar —el
 * que lleva más tiempo con su pedido más viejo—, y si aun así empatan, el de
 * identificador menor: arbitrario pero estable, de modo que la sugerencia no
 * cambia sola entre dos consultas.
 *
 * Devuelve `null`, y no un error, cuando no hay nadie de turno: quedarse sin
 * repartidores disponibles es una situación normal de la operación, no una
 * falla, y la interfaz debe poder decirlo con calma.
 */
export async function sugerirRepartidor(
  idUsuario: number,
  idPedido: number,
): Promise<SugerenciaRepartidorDTO> {
  await exigirEmpleado(idUsuario, 'gestionar los pedidos');
  const pedido = await obtenerPedido(idPedido);

  const estado = pedido.estado_pedido as EstadoPedido;
  if (!esAsignable(estado)) {
    throw new ErrorApp(409, `No se puede asignar un repartidor a un pedido ${estado}`);
  }

  // El mismo orden que usa la asignación automática: lo que se sugiere y lo
  // que el sistema elige solo tienen que ser la misma cosa.
  const repartidores = await repartoService.repartidoresPorPrioridad();
  const deTurno = repartidores.filter((r) => r.disponible);

  if (deTurno.length === 0) {
    return {
      sugerido: null,
      motivo:
        repartidores.length === 0
          ? 'No hay ningún empleado con cargo Repartidor'
          : 'Ningún repartidor está de turno en este momento',
      candidatos: repartidores.map(aCandidato),
    };
  }

  const elegido = deTurno[0];

  return {
    sugerido: aCandidato(elegido),
    motivo:
      elegido.entregasEnCurso === 0
        ? 'Está de turno y no tiene entregas en curso'
        : `Es quien menos entregas tiene en curso (${elegido.entregasEnCurso})`,
    candidatos: repartidores.map(aCandidato),
  };
}

function aCandidato(r: {
  idEmpleado: number;
  nombreCompleto: string;
  telefono: string | null;
  disponible: boolean;
  entregasEnCurso: number;
}): RepartidorDTO {
  return {
    id: r.idEmpleado,
    nombreCompleto: r.nombreCompleto,
    telefono: r.telefono,
    disponible: r.disponible,
    entregasEnCurso: r.entregasEnCurso,
  };
}

/**
 * Los pedidos asignados a quien consulta (RF-PED-07).
 *
 * Existe aparte del listado general porque el alcance es distinto: aquí el
 * repartidor ve **solo lo suyo**, y el identificador sale de la sesión. Sin
 * esta vista tendría que buscar sus entregas entre las de todos.
 *
 * Se ordenan por estado y no por fecha: lo que ya está en camino va primero,
 * que es lo que tiene que atender ahora.
 */
export async function misEntregas(idUsuario: number): Promise<PedidoGestionDTO[]> {
  const idEmpleado = await exigirEmpleado(idUsuario, 'consultar sus entregas');
  const pedidos = await pedidoModel.listarDeRepartidor(idEmpleado, ESTADOS_OCUPAN_REPARTIDOR);
  return pedidos.map(aGestionDTO);
}

/**
 * El repartidor declara si está de turno.
 *
 * Lo cambia él mismo y no un administrador: quien sabe si empezó su jornada es
 * él. Nace en falso, porque estar de turno se declara, no se supone.
 *
 * No exige el cargo Repartidor: la columna existe para todo empleado y no hace
 * daño que un cocinero la use. Lo que sí importa es que **solo se consulta**
 * para los repartidores, al sugerir.
 */
export async function cambiarDisponibilidad(
  idUsuario: number,
  disponible: boolean,
): Promise<DisponibilidadDTO> {
  const idEmpleado = await exigirEmpleado(idUsuario, 'declarar su disponibilidad');
  const actualizado = await empleadoModel.cambiarDisponibilidad(idEmpleado, disponible);
  return { disponible: actualizado.disponible };
}

/**
 * El turno que el empleado tiene declarado ahora.
 *
 * Existía la escritura pero no la lectura: la pantalla de entregas arrancaba
 * siempre en «Fuera de turno» y, al volver a ella, mostraba lo contrario de lo
 * guardado. El turno sí persistía —la sugerencia de reparto lo veía—; lo que
 * mentía era la pantalla del propio repartidor, que además lo invitaba a
 * «iniciar» un turno que ya tenía abierto.
 */
export async function consultarDisponibilidad(idUsuario: number): Promise<DisponibilidadDTO> {
  const idEmpleado = await exigirEmpleado(idUsuario, 'consultar su turno');
  return empleadoModel.obtenerDisponibilidad(idEmpleado);
}

/** Estados en los que todavía tiene sentido asignar o cambiar el repartidor. */
function esAsignable(estado: EstadoPedido): boolean {
  return estado === 'Recibido' || estado === 'En preparacion' || estado === 'En camino';
}

/**
 * Cerrar la entrega es afirmar qué pasó en la puerta: que se entregó y se
 * cobró, o que no se pudo entregar. Las dos salidas de «En camino».
 */
function esCierreDeEntrega(destino: EstadoPedido): boolean {
  return destino === 'Entregado' || destino === 'Cancelado';
}

/**
 * CU-PED-02 — solo el repartidor asignado cierra su propia entrega.
 *
 * Es él quien estuvo en la puerta y quien recibió el dinero del pedido en
 * efectivo, así que es el único que puede afirmarlo. Que otro empleado pudiera
 * cerrarlo por él convertía `id_repartidor` en una intención —quién *iba* a
 * entregar— en lugar de un registro de quién entregó y cobró.
 *
 * `PEDIDO_CERRAR_AJENO` es la salida para cuando el repartidor no está
 * disponible: se queda sin batería, se enferma, renuncia con un pedido en la
 * calle. Sin ella ese pedido no tendría forma de terminar.
 */
async function exigirQuePuedaCerrar(
  idUsuario: number,
  idEmpleado: number,
  pedido: PedidoParaGestion,
): Promise<void> {
  if (pedido.id_repartidor === idEmpleado) return;

  const permisos = await permisoModel.permisosDeUsuario(idUsuario);
  if (permisos.includes(PERMISO_CERRAR_AJENO)) return;

  throw new ErrorApp(
    403,
    'Solo el repartidor asignado puede cerrar esta entrega. ' +
      'Si no está disponible, debe hacerlo un administrador.',
  );
}

/**
 * RF-PED-08 — hace avanzar el pedido un paso del flujo.
 *
 * No se permite saltar etapas ni retroceder: la tabla de transiciones del
 * dominio es la única autoridad sobre qué movimiento es legítimo.
 */
export async function avanzarEstado(
  idUsuario: number,
  idPedido: number,
  destino: EstadoPedido,
): Promise<PedidoGestionDTO> {
  const idEmpleado = await exigirEmpleado(idUsuario, 'gestionar los pedidos');
  const pedido = await obtenerPedido(idPedido);
  const origen = pedido.estado_pedido as EstadoPedido;

  if (!esTransicionValida(origen, destino)) {
    const posibles = transicionesPosibles(origen);
    const detalleMensaje = posibles.length
      ? `desde ${origen} solo puede pasar a ${posibles.join(' o ')}`
      : `el pedido está en estado ${origen} y ya no admite cambios`;
    throw new ErrorApp(409, `Transición no permitida: ${detalleMensaje}`);
  }

  // CU-PED-02: el repartidor se asigna antes de marcar el pedido en camino.
  if (destino === 'En camino' && pedido.id_repartidor === null) {
    throw new ErrorApp(409, 'Asigne un repartidor antes de marcar el pedido en camino');
  }

  if (esCierreDeEntrega(destino)) {
    await exigirQuePuedaCerrar(idUsuario, idEmpleado, pedido);
  }

  const fechaEntrega = destino === 'Entregado' ? new Date() : null;

  /**
   * El estado del pedido, su stock y su cobro se mueven juntos.
   *
   * Entregar un pedido en efectivo es también cobrarlo, y darlo por no
   * entregado es devolver la comida al inventario y cerrar el cobro que nunca
   * se hizo. Separar esos efectos dejaría pedidos entregados sin cobrar o
   * comida descontada que nadie recibió.
   */
  await prisma.$transaction(async (tx: ClientePrisma) => {
    // Desde el tablero, "Cancelado" solo se alcanza desde En camino: es el
    // repartidor diciendo que no pudo entregarlo.
    await pedidoModel.actualizarEstado(
      idPedido,
      destino,
      fechaEntrega,
      tx,
      destino === 'Cancelado' ? 'No entregado' : null,
    );

    // Con su última entrega cerrada, el repartidor deja de estar en la calle:
    // su ubicación se olvida en la misma transacción.
    if (esCierreDeEntrega(destino) && pedido.id_repartidor !== null) {
      await seguimientoService.olvidarSiTermino(pedido.id_repartidor, tx);
    }

    if (destino === 'Entregado') {
      await pagoService.cerrarCobroDePedidoEnTransaccion(
        tx,
        idPedido,
        'Pagado',
        `Cobrado contra entrega por el empleado ${idUsuario}`,
      );
      return;
    }

    if (destino === 'Cancelado') {
      const completo = await pedidoModel.buscarConDetalle(idPedido, tx);
      if (completo) {
        await reponerAsignaciones(
          completo.detalle_pedido.map((d) => ({
            idProducto: d.id_producto,
            idAlmacen: d.id_almacen,
            cantidad: d.cantidad,
          })),
          tx,
        );
      }
      await pagoService.cerrarCobroDePedidoEnTransaccion(
        tx,
        idPedido,
        'Fallido',
        `No entregado, informado por el empleado ${idUsuario}`,
      );
    }
  });

  // CU-PED-02: el sistema notifica al cliente el cambio de estado. Se dispara
  // en segundo plano: quien mueve el pedido en el mostrador no tiene por qué
  // esperar a que el servidor de correo responda, y si el correo falla el
  // pedido igual avanzó.
  avisoService.enSegundoPlano(
    avisoService.estadoDePedidoCambio(
      {
        id: pedido.id_pedido,
        correoCliente: pedido.cliente.usuario.email,
        nombreCliente: pedido.cliente.usuario.nombre,
        total: Number(pedido.total),
        metodoPago: pedido.metodo_pago,
        // Entregar en efectivo es cobrar: tras este cambio ya está pagado.
        pagado: pedido.estado_pago === 'Pagado' || destino === 'Entregado',
      },
      destino,
    ),
  );

  return aGestionDTO(await obtenerPedido(idPedido));
}

/**
 * RF-PED-07 — asigna el repartidor.
 * CU-PED-02, excepciones: solo pueden asignarse empleados con cargo Repartidor.
 */
export async function asignarRepartidor(
  idUsuario: number,
  idPedido: number,
  idRepartidor: number,
): Promise<PedidoGestionDTO> {
  await exigirEmpleado(idUsuario, 'gestionar los pedidos');
  const pedido = await obtenerPedido(idPedido);

  const estado = pedido.estado_pedido as EstadoPedido;
  if (ESTADOS_TERMINALES.includes(estado)) {
    throw new ErrorApp(409, `No se puede asignar un repartidor a un pedido ${estado}`);
  }

  const empleado = await empleadoModel.buscarPorId(idRepartidor);
  if (!empleado) throw new ErrorApp(404, 'El empleado indicado no existe');
  if (empleado.cargo.nombre !== CARGO_REPARTIDOR) {
    throw new ErrorApp(
      409,
      `Solo puede asignarse personal con cargo ${CARGO_REPARTIDOR}; el empleado indicado tiene el cargo ${empleado.cargo.nombre}`,
    );
  }
  if (!empleado.usuario.activo) {
    throw new ErrorApp(409, 'El repartidor indicado está dado de baja');
  }

  await pedidoModel.asignarRepartidor(idPedido, idRepartidor);
  return aGestionDTO(await obtenerPedido(idPedido));
}
