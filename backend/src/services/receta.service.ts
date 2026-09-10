import { prisma } from '../config/prisma.js';
import * as recetaModel from '../models/receta.model.js';
import * as productoModel from '../models/producto.model.js';
import type { RecetaConsultada } from '../models/receta.model.js';
import type {
  DatosActualizarReceta,
  DatosCrearReceta,
  LineaRecetaDTO,
  RecetaDTO,
} from '../dtos/receta.dto.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * CU-PRO-01 — Gestionar Producto y Receta (parte de receta).
 *
 * RF-PRO-04 exige varias versiones por producto con una sola activa. El
 * esquema ya lo garantiza con el índice parcial `ux_receta_activa`; aquí se
 * comprueba antes para poder devolver el mensaje del caso de uso en lugar de
 * un error de violación de índice.
 */

function aDTO(receta: RecetaConsultada): RecetaDTO {
  const insumos: LineaRecetaDTO[] = receta.detalle_receta.map((d) => ({
    idIngrediente: d.id_ingrediente,
    nombre: d.ingrediente.nombre,
    unidad: d.ingrediente.unidad_medida.abreviatura,
    cantidadRequerida: Number(d.cantidad_requerida),
    insumoActivo: d.ingrediente.activo,
  }));

  return {
    id: receta.id_receta,
    nombre: receta.nombre,
    producto: { id: receta.producto.id_producto, nombre: receta.producto.nombre },
    rendimiento: receta.rendimiento,
    tiempoPreparacionMinutos: receta.tiempo_preparacion_minutos,
    instrucciones: receta.instrucciones,
    activa: receta.activa,
    divisible: receta.divisible,
    insumos,
  };
}

async function exigirReceta(id: number): Promise<RecetaConsultada> {
  const receta = await recetaModel.buscarPorId(id);
  if (!receta) throw new ErrorApp(404, 'La receta no existe');
  return receta;
}

async function exigirProducto(idProducto: number): Promise<void> {
  const producto = await productoModel.buscarParaGestion(idProducto);
  if (!producto) throw new ErrorApp(404, 'El producto no existe');
}

/**
 * Agrupa las cantidades repetidas del mismo insumo: la clave primaria del
 * detalle es (receta, ingrediente), de modo que dos líneas iguales colisionan.
 */
function consolidarInsumos(insumos: { idIngrediente: number; cantidadRequerida: number }[]) {
  const porInsumo = new Map<number, number>();
  for (const linea of insumos) {
    porInsumo.set(
      linea.idIngrediente,
      (porInsumo.get(linea.idIngrediente) ?? 0) + linea.cantidadRequerida,
    );
  }
  return [...porInsumo].map(([id_ingrediente, cantidad_requerida]) => ({
    id_ingrediente,
    cantidad_requerida: cantidad_requerida,
  }));
}

/** CU-PRO-01, precondición: deben existir insumos previamente registrados. */
async function exigirInsumosValidos(
  lineas: { id_ingrediente: number }[],
  tx: Parameters<typeof recetaModel.insumosExistentes>[1],
): Promise<void> {
  const ids = lineas.map((l) => l.id_ingrediente);
  const existentes = await recetaModel.insumosExistentes(ids, tx);
  const encontrados = new Set(existentes.map((i) => i.id_ingrediente));
  const faltantes = ids.filter((id) => !encontrados.has(id));

  if (faltantes.length > 0) {
    throw new ErrorApp(
      404,
      `Hay insumos inexistentes o dados de baja: ${faltantes.join(', ')}`,
    );
  }
}

export async function listarDeProducto(idProducto: number): Promise<RecetaDTO[]> {
  await exigirProducto(idProducto);
  const recetas = await recetaModel.listarDeProducto(idProducto);
  return recetas.map(aDTO);
}

export async function obtener(idReceta: number): Promise<RecetaDTO> {
  return aDTO(await exigirReceta(idReceta));
}

/**
 * Registra una versión de receta.
 *
 * CU-PRO-01, excepción: si se intenta activar una segunda receta para el mismo
 * producto, la operación se rechaza. Para reemplazar la vigente está la
 * operación explícita de activación, que desactiva la anterior.
 */
export async function crear(idProducto: number, datos: DatosCrearReceta): Promise<RecetaDTO> {
  await exigirProducto(idProducto);
  const lineas = consolidarInsumos(datos.insumos);

  const idReceta = await prisma.$transaction(async (tx) => {
    await exigirInsumosValidos(lineas, tx);

    if (datos.activa) {
      const vigente = await recetaModel.buscarActivaDeProducto(idProducto, tx);
      if (vigente) {
        throw new ErrorApp(
          409,
          `El producto ya tiene la receta activa "${vigente.nombre}". Registre la versión como inactiva y actívela después para reemplazarla.`,
        );
      }
    }

    const receta = await recetaModel.crear(tx, {
      idProducto,
      nombre: datos.nombre,
      rendimiento: datos.rendimiento,
      tiempoPreparacionMinutos: datos.tiempoPreparacionMinutos,
      instrucciones: datos.instrucciones ?? null,
      activa: datos.activa,
      divisible: datos.divisible,
    });

    await recetaModel.insertarDetalle(tx, receta.id_receta, lineas);
    return receta.id_receta;
  });

  return obtener(idReceta);
}

export async function actualizar(
  idReceta: number,
  datos: DatosActualizarReceta,
): Promise<RecetaDTO> {
  await exigirReceta(idReceta);

  await prisma.$transaction(async (tx) => {
    await recetaModel.actualizarCabecera(tx, idReceta, datos);

    if (datos.insumos) {
      const lineas = consolidarInsumos(datos.insumos);
      await exigirInsumosValidos(lineas, tx);
      await recetaModel.reemplazarDetalle(tx, idReceta, lineas);
    }
  });

  return obtener(idReceta);
}

/**
 * CU-PRO-01, variación: al activar una nueva versión de receta, el sistema
 * desactiva automáticamente la anterior.
 *
 * El orden dentro de la transacción importa: primero se desactiva la vigente y
 * después se activa la nueva. A la inversa, el índice `ux_receta_activa`
 * rechazaría la operación al haber dos activas a la vez.
 */
export async function activar(idReceta: number): Promise<RecetaDTO> {
  const receta = await exigirReceta(idReceta);
  if (receta.activa) return aDTO(receta);

  await prisma.$transaction(async (tx) => {
    const vigente = await recetaModel.buscarActivaDeProducto(receta.id_producto, tx);
    if (vigente) await recetaModel.cambiarActiva(tx, vigente.id_receta, false);
    await recetaModel.cambiarActiva(tx, idReceta, true);
  });

  return obtener(idReceta);
}

/** Una receta con órdenes de producción registradas conserva su historial. */
export async function eliminar(idReceta: number): Promise<void> {
  await exigirReceta(idReceta);

  const ordenes = await recetaModel.contarOrdenes(idReceta);
  if (ordenes > 0) {
    throw new ErrorApp(
      409,
      `No se puede eliminar la receta porque tiene ${ordenes} orden(es) de producción registradas`,
    );
  }

  await recetaModel.eliminar(idReceta);
}
