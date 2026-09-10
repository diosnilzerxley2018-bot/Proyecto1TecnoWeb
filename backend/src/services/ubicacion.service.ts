import { prisma } from '../config/prisma.js';
import * as ubicacionModel from '../models/ubicacion.model.js';
import type { UbicacionConsultada } from '../models/ubicacion.model.js';
import type { ClientePrisma } from '../models/stock.model.js';
import { exigirCliente } from './actor.service.js';
import type {
  DatosCrearUbicacion,
  DatosDestinoPedido,
  UbicacionDTO,
} from '../dtos/ubicacion.dto.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * CU-PED-03 — Gestionar Ubicación.
 *
 * El caso de uso era una inclusión de Gestionar Pedido y nada más: cada pedido
 * creaba una dirección suelta y el cliente la reescribía cada vez. Ahora las
 * direcciones son suyas y las reutiliza, que es como se comporta cualquier
 * servicio de entrega.
 *
 * **La regla que gobierna el archivo:** una dirección **nunca se edita ni se
 * borra**. Corregirla crea una fila nueva y archiva la anterior; eliminarla la
 * archiva. Los pedidos entregados en ella siguen apuntándola, y su historial
 * dice dónde se entregó de verdad.
 */

/** Tope por cliente. No es una restricción del negocio: evita listas inmanejables. */
const MAXIMO_DIRECCIONES = 10;

function aDTO(ubicacion: {
  id_ubicacion: number;
  etiqueta: string | null;
  calle: string;
  numero: string | null;
  referencia: string | null;
  latitud: unknown;
  longitud: unknown;
  vigente: boolean;
}): UbicacionDTO {
  return {
    id: ubicacion.id_ubicacion,
    etiqueta: ubicacion.etiqueta,
    calle: ubicacion.calle,
    numero: ubicacion.numero,
    referencia: ubicacion.referencia ?? '',
    latitud: ubicacion.latitud === null ? null : Number(ubicacion.latitud),
    longitud: ubicacion.longitud === null ? null : Number(ubicacion.longitud),
    vigente: ubicacion.vigente,
  };
}

/**
 * Comprueba que la dirección sea del cliente que la invoca.
 *
 * Sin esto, cambiar un número en la URL bastaría para leer o borrar la
 * dirección de otra persona. El identificador del titular sale de la sesión.
 */
async function exigirPropia(
  idUbicacion: number,
  idCliente: number,
  tx: ClientePrisma = prisma,
): Promise<UbicacionConsultada> {
  const ubicacion = await ubicacionModel.buscarPorId(idUbicacion, tx);
  if (!ubicacion || ubicacion.id_cliente !== idCliente) {
    // Mismo mensaje para "no existe" que para "es de otro": confirmar cuál de
    // las dos revelaría qué identificadores están en uso.
    throw new ErrorApp(404, 'La dirección no existe');
  }
  return ubicacion;
}

export async function listar(idUsuario: number): Promise<UbicacionDTO[]> {
  const idCliente = await exigirCliente(idUsuario, 'administrar sus direcciones');
  const ubicaciones = await ubicacionModel.listarDeCliente(idCliente);
  return ubicaciones.map(aDTO);
}

export async function crear(
  idUsuario: number,
  datos: DatosCrearUbicacion,
): Promise<UbicacionDTO> {
  const idCliente = await exigirCliente(idUsuario, 'administrar sus direcciones');

  const cuantas = await ubicacionModel.contarVigentes(idCliente);
  if (cuantas >= MAXIMO_DIRECCIONES) {
    throw new ErrorApp(
      409,
      `Ya tiene ${MAXIMO_DIRECCIONES} direcciones guardadas. Elimine alguna para agregar otra.`,
    );
  }

  const creada = await ubicacionModel.crear(prisma, {
    calle: datos.calle,
    numero: datos.numero ?? null,
    referencia: datos.referencia,
    latitud: datos.latitud ?? null,
    longitud: datos.longitud ?? null,
    etiqueta: datos.etiqueta,
    idCliente,
  });

  return aDTO(creada);
}

/**
 * Corrige una dirección creando su reemplazo.
 *
 * Devuelve la fila nueva. La anterior queda archivada en la misma transacción:
 * si una de las dos operaciones fallara, el cliente terminaría con la
 * dirección duplicada o sin ninguna.
 */
export async function reemplazar(
  idUsuario: number,
  idUbicacion: number,
  datos: DatosCrearUbicacion,
): Promise<UbicacionDTO> {
  const idCliente = await exigirCliente(idUsuario, 'administrar sus direcciones');

  const nueva = await prisma.$transaction(async (tx: ClientePrisma) => {
    await exigirPropia(idUbicacion, idCliente, tx);
    await ubicacionModel.archivar(idUbicacion, tx);

    return ubicacionModel.crear(tx, {
      calle: datos.calle,
      numero: datos.numero ?? null,
      referencia: datos.referencia,
      latitud: datos.latitud ?? null,
      longitud: datos.longitud ?? null,
      etiqueta: datos.etiqueta,
      idCliente,
    });
  });

  return aDTO(nueva);
}

export async function eliminar(idUsuario: number, idUbicacion: number): Promise<void> {
  const idCliente = await exigirCliente(idUsuario, 'administrar sus direcciones');
  await exigirPropia(idUbicacion, idCliente);
  await ubicacionModel.archivar(idUbicacion);
}

/**
 * Resuelve el destino de un pedido, dentro de su transacción.
 *
 * Acepta las dos formas del carrito y devuelve siempre el identificador de una
 * fila de `ubicacion`:
 *
 * - **Dirección guardada** — se comprueba que sea del cliente y se reutiliza.
 *   No se crea nada: el pedido apunta a la misma fila que el cliente ve en su
 *   lista.
 * - **Dirección escrita en el momento** — se crea. Si trae etiqueta queda
 *   guardada para la próxima vez; si no, se registra sin dueño y sirve solo
 *   para este pedido, que es el comportamiento de quien pide una vez a una
 *   dirección que no va a repetir.
 */
export async function resolverDestino(
  tx: ClientePrisma,
  idCliente: number,
  destino: DatosDestinoPedido,
): Promise<number> {
  if (destino.idUbicacion !== undefined) {
    const guardada = await exigirPropia(destino.idUbicacion, idCliente, tx);
    if (!guardada.vigente) {
      throw new ErrorApp(409, 'Esa dirección fue reemplazada. Elija otra.');
    }
    return guardada.id_ubicacion;
  }

  // El esquema ya lo garantiza cuando no hay `idUbicacion`. Se vuelve a
  // comprobar aquí porque este servicio también podría invocarse desde otro
  // punto, y porque es lo que le da al compilador la certeza del tipo.
  if (!destino.calle || !destino.referencia) {
    throw new ErrorApp(400, 'La dirección necesita calle y referencia');
  }

  const creada = await ubicacionModel.crear(tx, {
    calle: destino.calle,
    numero: destino.numero ?? null,
    referencia: destino.referencia,
    latitud: destino.latitud ?? null,
    longitud: destino.longitud ?? null,
    etiqueta: destino.etiqueta ?? null,
    // Sin etiqueta no se guarda en la libreta del cliente: fue de una vez.
    idCliente: destino.etiqueta ? idCliente : null,
  });

  return creada.id_ubicacion;
}
