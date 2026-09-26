import * as insumoModel from '../models/insumo.model.js';
import type { InsumoConsultado } from '../models/insumo.model.js';
import type {
  DatosActualizarInsumo,
  DatosCrearInsumo,
  FiltroInsumosDTO,
  InsumoDTO,
  UnidadMedidaDTO,
} from '../dtos/insumo.dto.js';
import { ErrorApp } from '../errors/error-app.js';
import { redondearCantidad } from '../utils/cantidad.js';
import type { TipoConservacion } from '../config/dominio.js';

/**
 * CU-INV-01 — Gestionar Insumo.
 *
 * El nombre del insumo no se exige único: el esquema declara UNIQUE en
 * `almacen.nombre` pero no en `ingrediente.nombre`, y con razón —un mismo
 * producto puede registrarse en dos unidades distintas, por ejemplo tomate por
 * kilogramo y tomate por unidad.
 */

function aDTO(insumo: InsumoConsultado): InsumoDTO {
  const existencias = insumo.ingrediente_almacen.map((e) => ({
    idAlmacen: e.almacen.id_almacen,
    almacen: e.almacen.nombre,
    stock: Number(e.stock_actual),
  }));

  return {
    id: insumo.id_ingrediente,
    nombre: insumo.nombre,
    unidad: {
      id: insumo.unidad_medida.id_unidad,
      nombre: insumo.unidad_medida.nombre,
      abreviatura: insumo.unidad_medida.abreviatura,
    },
    costoUnitario: Number(insumo.costo_unitario),
    stockMinimo: Number(insumo.stock_minimo),
    activo: insumo.activo,
    tipoConservacion: insumo.tipo_conservacion as TipoConservacion,
    controlaVencimiento: insumo.controla_vencimiento,
    // Sumar decimales en coma flotante deja restos (0,1 + 0,2 = 0,30000000000000004):
    // se redondea a los tres decimales que guarda la base.
    stockTotal: redondearCantidad(existencias.reduce((total, e) => total + e.stock, 0)),
    existencias,
  };
}

async function exigirInsumo(id: number): Promise<InsumoConsultado> {
  const insumo = await insumoModel.buscarPorId(id);
  if (!insumo) throw new ErrorApp(404, 'El insumo no existe');
  return insumo;
}

/** CU-INV-01, precondición: deben existir unidades de medida registradas. */
async function exigirUnidad(idUnidad: number): Promise<void> {
  const unidad = await insumoModel.buscarUnidad(idUnidad);
  if (!unidad) throw new ErrorApp(404, 'La unidad de medida indicada no existe');
}

export async function listar(filtro: FiltroInsumosDTO): Promise<InsumoDTO[]> {
  const insumos = await insumoModel.listar({
    termino: filtro.termino,
    soloActivos: !filtro.incluirInactivos,
  });
  return insumos.map(aDTO);
}

export async function obtener(id: number): Promise<InsumoDTO> {
  return aDTO(await exigirInsumo(id));
}

export async function listarUnidades(): Promise<UnidadMedidaDTO[]> {
  const unidades = await insumoModel.listarUnidades();
  return unidades.map((u) => ({
    id: u.id_unidad,
    nombre: u.nombre,
    abreviatura: u.abreviatura,
  }));
}

export async function crear(datos: DatosCrearInsumo): Promise<InsumoDTO> {
  await exigirUnidad(datos.idUnidad);
  const creado = await insumoModel.crear(datos);
  return aDTO(await exigirInsumo(creado.id_ingrediente));
}

/**
 * CU-INV-01, excepciones: no se permite modificar la unidad de medida de un
 * insumo que ya registra existencias.
 *
 * El motivo es que el stock guardado está expresado en la unidad anterior;
 * cambiarla convertiría 5 kilogramos en 5 gramos sin que nadie lo note.
 */
export async function actualizar(id: number, datos: DatosActualizarInsumo): Promise<InsumoDTO> {
  const insumo = await exigirInsumo(id);

  const cambiaUnidad =
    datos.idUnidad !== undefined && datos.idUnidad !== insumo.unidad_medida.id_unidad;

  if (cambiaUnidad) {
    await exigirUnidad(datos.idUnidad!);
    const conExistencias = await insumoModel.contarExistencias(id);
    if (conExistencias > 0) {
      throw new ErrorApp(
        409,
        'No se puede cambiar la unidad de medida de un insumo que ya registra existencias',
      );
    }
  }

  await insumoModel.actualizar(id, datos);
  return aDTO(await exigirInsumo(id));
}

/**
 * CU-INV-01, excepciones: si el insumo forma parte de alguna receta o tiene
 * movimientos registrados, el sistema no permite eliminarlo.
 *
 * Para retirarlo de circulación sin perder su historial está la baja lógica,
 * que se aplica actualizando `activo` a falso.
 */
export async function eliminar(id: number): Promise<void> {
  await exigirInsumo(id);

  const [enRecetas, movimientos, existencias] = await Promise.all([
    insumoModel.contarUsoEnRecetas(id),
    insumoModel.contarMovimientos(id),
    insumoModel.contarExistencias(id),
  ]);

  const impedimentos: string[] = [];
  if (enRecetas > 0) impedimentos.push(`forma parte de ${enRecetas} receta(s)`);
  if (movimientos > 0) impedimentos.push(`tiene ${movimientos} movimiento(s) registrado(s)`);
  if (existencias > 0) impedimentos.push('registra existencias en almacén');

  if (impedimentos.length > 0) {
    throw new ErrorApp(
      409,
      `No se puede eliminar el insumo porque ${impedimentos.join(' y ')}. Puede darlo de baja en su lugar.`,
    );
  }

  await insumoModel.eliminar(id);
}
