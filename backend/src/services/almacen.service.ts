import * as almacenModel from '../models/almacen.model.js';
import type { AlmacenConsultado } from '../models/almacen.model.js';
import type {
  AlmacenDTO,
  DatosActualizarAlmacen,
  DatosCrearAlmacen,
} from '../dtos/almacen.dto.js';
import type { TipoConservacion } from '../config/dominio.js';
import { ErrorApp } from '../errors/error-app.js';

/** CU-INV-02 — Gestionar Almacén. */

function aDTO(almacen: AlmacenConsultado): AlmacenDTO {
  return {
    id: almacen.id_almacen,
    nombre: almacen.nombre,
    tipoConservacion: almacen.tipo_conservacion as TipoConservacion,
    ubicacionFisica: almacen.ubicacion_fisica,
    preferido: almacen.preferido,
  };
}

/**
 * El esquema ya declara `nombre` como UNIQUE; comprobarlo antes permite
 * devolver el mensaje que pide el caso de uso en lugar de un error de motor.
 */
async function exigirNombreLibre(nombre: string, idActual?: number): Promise<void> {
  const existente = await almacenModel.buscarPorNombre(nombre);
  if (existente && existente.id_almacen !== idActual) {
    throw new ErrorApp(409, `Ya existe un almacén con el nombre ${nombre}`);
  }
}

async function exigirAlmacen(id: number): Promise<AlmacenConsultado> {
  const almacen = await almacenModel.buscarPorId(id);
  if (!almacen) throw new ErrorApp(404, 'El almacén no existe');
  return almacen;
}

export async function listar(): Promise<AlmacenDTO[]> {
  const almacenes = await almacenModel.listar();
  return almacenes.map(aDTO);
}

export async function obtener(id: number): Promise<AlmacenDTO> {
  return aDTO(await exigirAlmacen(id));
}

export async function crear(datos: DatosCrearAlmacen): Promise<AlmacenDTO> {
  await exigirNombreLibre(datos.nombre);
  const creado = await almacenModel.crear({
    nombre: datos.nombre,
    tipoConservacion: datos.tipoConservacion,
    ubicacionFisica: datos.ubicacionFisica ?? null,
  });
  return aDTO(creado);
}

export async function actualizar(id: number, datos: DatosActualizarAlmacen): Promise<AlmacenDTO> {
  const previo = await exigirAlmacen(id);
  if (datos.nombre !== undefined) await exigirNombreLibre(datos.nombre, id);

  // Marcar uno como preferido desmarca al anterior de su misma conservación.
  // El orden importa: el índice parcial rechazaría tener dos a la vez.
  if (datos.preferido) {
    const tipo = datos.tipoConservacion ?? previo.tipo_conservacion;
    await almacenModel.quitarPreferenciaDe(tipo, id);
  }

  const actualizado = await almacenModel.actualizar(id, {
    nombre: datos.nombre,
    tipoConservacion: datos.tipoConservacion,
    ubicacionFisica: datos.ubicacionFisica,
    preferido: datos.preferido,
  });
  return aDTO(actualizado);
}

/**
 * CU-INV-02, excepciones: si el almacén registra existencias o movimientos,
 * el sistema no permite eliminarlo. La tabla no tiene columna `activo`, de
 * modo que aquí no cabe una baja lógica: o está libre, o se conserva.
 */
export async function eliminar(id: number): Promise<void> {
  await exigirAlmacen(id);
  const dependencias = await almacenModel.contarDependencias(id);
  if (dependencias > 0) {
    throw new ErrorApp(
      409,
      'No se puede eliminar el almacén porque registra existencias o movimientos',
    );
  }
  await almacenModel.eliminar(id);
}
