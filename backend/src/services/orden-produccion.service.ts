import { prisma } from '../config/prisma.js';
import * as ordenModel from '../models/orden-produccion.model.js';
import { pagina, type Pagina } from '../dtos/paginacion.dto.js';
import type {
  OrdenConsultada,
  RecetaPlanificable,
} from '../models/orden-produccion.model.js';
import type { ClientePrisma } from '../models/stock.model.js';
import type {
  DatosCrearOrden,
  DatosFinalizarOrden,
  InsumoRequeridoDTO,
  OrdenProduccionDTO,
} from '../dtos/orden.dto.js';
import { asignarInsumos, type Asignacion } from './stock.service.js';
import * as egresoService from './egreso.service.js';
import * as ingresoService from './ingreso.service.js';
import { exigirEmpleado } from './actor.service.js';
import {
  esOrdenCancelable,
  transicionesDeOrden,
  type EstadoOrden,
  type TipoConservacion,
} from '../config/dominio.js';
import { ErrorApp } from '../errors/error-app.js';
import { dosDecimales } from '../utils/dinero.js';
import { redondearCantidad } from '../utils/cantidad.js';

/**
 * CU-PRO-02 — Gestionar Orden de Producción, con CU-PRO-04 — Cancelar Orden
 * como extensión.
 *
 * Es el caso de uso con más inclusiones del modelo: incluye a Verificar
 * Disponibilidad de Stock, a Gestionar Egreso y a Gestionar Ingreso. Las tres
 * son aquí llamadas de función reales.
 */

const ACCION = 'gestionar órdenes de producción';
const MOTIVO_PRODUCCION = 'Produccion';

/** Redondeo a dos decimales, la precisión de las columnas NUMERIC(_,2). */

/** Línea de receta con lo necesario para calcular y costear. */
type LineaReceta = RecetaPlanificable['detalle_receta'][number];

/**
 * Insumos requeridos para producir `cantidad` porciones.
 *
 * CU-PRO-02: "El sistema calcula los insumos requeridos dividiendo la cantidad
 * a producir entre el rendimiento de la receta y multiplicando por la cantidad
 * requerida de cada insumo."
 */
function calcularInsumos(
  receta: { rendimiento: number; detalle_receta: LineaReceta[] },
  cantidad: number,
): InsumoRequeridoDTO[] {
  const factor = cantidad / receta.rendimiento;

  return receta.detalle_receta.map((linea) => ({
    idIngrediente: linea.id_ingrediente,
    nombre: linea.ingrediente.nombre,
    unidad: linea.ingrediente.unidad_medida.abreviatura,
    cantidadRequerida: redondearCantidad(Number(linea.cantidad_requerida) * factor),
    costoUnitario: Number(linea.ingrediente.costo_unitario),
  }));
}

/** Costo de la corrida: lo que cuestan los insumos que consume (RF-PRO-08). */
function calcularCosto(insumos: InsumoRequeridoDTO[]): number {
  return dosDecimales(
    insumos.reduce((total, i) => total + i.cantidadRequerida * i.costoUnitario, 0),
  );
}

/**
 * Los insumos que la corrida **consumió de verdad** (hallazgo H6).
 *
 * Se leen de la nota de egreso que la orden generó al finalizar. El costo
 * unitario del ingrediente es el de hoy y no el del día de la corrida —el
 * esquema no lo guarda en el egreso—, pero eso no altera el costo del
 * historial: ese quedó congelado en `orden.costo_total`.
 *
 * Sin esto, corregir una receta reescribía en silencio lo que declaraban haber
 * consumido todas las órdenes ya finalizadas. Es la misma distinción que en la
 * venta, donde `detalle_venta.precio_unitario` congela el precio del momento.
 */
function insumosConsumidos(orden: OrdenConsultada): InsumoRequeridoDTO[] {
  return (orden.nota_egreso?.detalle_egreso_insumo ?? []).map((linea) => {
    const insumo = linea.ingrediente_almacen.ingrediente;
    return {
      idIngrediente: insumo.id_ingrediente,
      nombre: insumo.nombre,
      unidad: insumo.unidad_medida.abreviatura,
      cantidadRequerida: Number(linea.cantidad),
      costoUnitario: Number(insumo.costo_unitario),
    };
  });
}

function aDTO(orden: OrdenConsultada): OrdenProduccionDTO {
  const estado = orden.estado as EstadoOrden;

  /*
   * Antes de ejecutar, los insumos y el costo son una **previsión** calculada
   * desde la receta vigente. Después, son el **hecho** que quedó registrado.
   * Mezclar las dos cosas es lo que hacía que el historial se reescribiera al
   * corregir una receta.
   */
  const finalizada = estado === 'Finalizada';
  const consumidos = finalizada ? insumosConsumidos(orden) : [];
  const insumos =
    finalizada && consumidos.length > 0
      ? consumidos
      : calcularInsumos(orden.receta, orden.cantidad);

  const costo =
    orden.costo_total !== null ? Number(orden.costo_total) : calcularCosto(insumos);

  const obtenida = orden.cantidad_obtenida;
  const ingresado = orden.nota_ingreso?.detalle_ingreso_producto[0] ?? null;

  return {
    id: orden.id_orden_produccion,
    fecha: orden.fecha.toISOString(),
    estado,
    cantidad: orden.cantidad,
    fechaFinalizacion: orden.fecha_finalizacion?.toISOString() ?? null,
    transicionesPosibles: transicionesDeOrden(estado),
    cancelable: esOrdenCancelable(estado),
    receta: {
      id: orden.receta.id_receta,
      nombre: orden.receta.nombre,
      rendimiento: orden.receta.rendimiento,
    },
    producto: {
      id: orden.receta.producto.id_producto,
      nombre: orden.receta.producto.nombre,
      tipoConservacion: orden.receta.producto.tipo_conservacion as TipoConservacion,
    },
    registradoPor: {
      id: orden.empleado.id_empleado,
      nombreCompleto: `${orden.empleado.usuario.nombre} ${orden.empleado.usuario.apellido}`,
    },
    insumosRequeridos: insumos,
    costoEstimado: costo,
    cantidadObtenida: obtenida,
    // Solo cuando salió de menos. Obtener de más no es una merma negativa: es
    // un rendimiento mejor, y llamarlo merma confundiría el dato.
    merma: obtenida === null ? null : Math.max(0, orden.cantidad - obtenida),
    costoUnitario:
      obtenida === null || obtenida === 0 ? null : dosDecimales(costo / obtenida),
    almacenDestino: ingresado
      ? { id: ingresado.id_almacen, nombre: ingresado.producto_almacen.almacen.nombre }
      : null,
    notas: { egreso: orden.id_nota_egreso, ingreso: orden.id_nota_ingreso },
  };
}

async function exigirOrden(id: number): Promise<OrdenConsultada> {
  const orden = await ordenModel.buscarPorId(id);
  if (!orden) throw new ErrorApp(404, 'La orden de producción no existe');
  return orden;
}

/**
 * «include» Verificar Disponibilidad de Stock.
 *
 * CU-PRO-02, excepción: "Si los insumos disponibles son insuficientes, el
 * sistema impide iniciar la orden e informa qué insumo falta y en qué cantidad."
 * El mensaje se compone aquí porque es esta capa la que conoce los nombres.
 */
async function resolverInsumos(
  insumos: InsumoRequeridoDTO[],
  tx: ClientePrisma,
): Promise<Asignacion[]> {
  const { asignaciones, faltantes } = await asignarInsumos(
    insumos.map((i) => ({ idItem: i.idIngrediente, cantidad: i.cantidadRequerida })),
    tx,
  );

  if (faltantes.length > 0) {
    const nombreDe = new Map(insumos.map((i) => [i.idIngrediente, i]));
    const detalle = faltantes
      .map((f) => {
        const insumo = nombreDe.get(f.idItem)!;
        const falta = redondearCantidad(f.solicitado - f.disponible);
        return `${insumo.nombre}: faltan ${falta} ${insumo.unidad} (requiere ${f.solicitado}, disponible ${f.disponible})`;
      })
      .join('; ');
    throw new ErrorApp(409, `Insumos insuficientes. ${detalle}`);
  }

  return asignaciones;
}

export async function listar(
  idUsuario: number,
  filtro: ordenModel.FiltroOrdenes,
): Promise<Pagina<OrdenProduccionDTO>> {
  await exigirEmpleado(idUsuario, ACCION);
  const [ordenes, total] = await ordenModel.listar(filtro);
  return pagina(ordenes.map(aDTO), total, filtro);
}

/** Cuántas órdenes hay en cada estado, para el tablero de producción. */
export async function contarPorEstado(
  idUsuario: number,
  filtro: { desde?: string; hasta?: string },
): Promise<Record<string, number>> {
  await exigirEmpleado(idUsuario, ACCION);
  const filas = await ordenModel.contarPorEstado(filtro);

  return Object.fromEntries(filas.map((f) => [f.estado, f._count._all]));
}

export async function obtener(idUsuario: number, id: number): Promise<OrdenProduccionDTO> {
  await exigirEmpleado(idUsuario, ACCION);
  return aDTO(await exigirOrden(id));
}

/**
 * Registra la orden en estado Pendiente tras comprobar los insumos.
 *
 * La verificación de aquí y la que ocurre al finalizar no son redundantes: son
 * dos momentos distintos. Entre la planificación y la ejecución, otra
 * operación puede haber consumido los insumos, de modo que la segunda
 * comprobación —la que hace el egreso— es la que decide.
 */
export async function crear(
  idUsuario: number,
  datos: DatosCrearOrden,
): Promise<OrdenProduccionDTO> {
  const idEmpleado = await exigirEmpleado(idUsuario, ACCION);

  const receta = await ordenModel.recetaParaPlanificar(datos.idReceta);
  if (!receta) throw new ErrorApp(404, 'La receta indicada no existe');

  // CU-PRO-02, precondición: el producto debe tener una receta activa.
  if (!receta.activa) {
    throw new ErrorApp(409, 'Solo puede producirse a partir de la receta activa del producto');
  }

  /*
   * Una receta no divisible se produce en corridas completas.
   *
   * Una bandeja de horno o una torta no se hacen "a la cuarta parte": la
   * producción que dispara una venta ya lo respetaba (`cantidadAProducir`
   * redondea hacia arriba), pero la orden manual escalaba la receta por
   * cualquier fracción y registraba un consumo de insumos que en la cocina no
   * puede ocurrir. Aquí no se redondea en silencio —quien planifica eligió un
   * número— sino que se rechaza diciendo cuál sería el válido.
   */
  if (!receta.divisible && datos.cantidad % receta.rendimiento !== 0) {
    const sugerida = cantidadAProducir(receta, datos.cantidad);
    throw new ErrorApp(
      400,
      `La receta "${receta.nombre}" no es divisible: cada corrida rinde ` +
        `${receta.rendimiento} porciones y solo pueden producirse múltiplos de ese número. ` +
        `Para cubrir ${datos.cantidad} porciones, produzca ${sugerida}.`,
    );
  }

  // Se verifica antes de registrar: si faltan insumos, la orden no llega a existir.
  const insumos = calcularInsumos(receta, datos.cantidad);
  await prisma.$transaction((tx: ClientePrisma) => resolverInsumos(insumos, tx));

  const creada = await ordenModel.crear({
    idReceta: datos.idReceta,
    cantidad: datos.cantidad,
    idEmpleado,
  });

  return aDTO(await exigirOrden(creada.id_orden_produccion));
}

/** Pendiente → En proceso. */
export async function iniciar(idUsuario: number, id: number): Promise<OrdenProduccionDTO> {
  await exigirEmpleado(idUsuario, ACCION);
  const orden = await exigirOrden(id);
  const estado = orden.estado as EstadoOrden;

  if (!transicionesDeOrden(estado).includes('En proceso')) {
    throw new ErrorApp(409, `No se puede iniciar una orden en estado ${estado}`);
  }

  await ordenModel.cambiarEstado(id, 'En proceso');
  return aDTO(await exigirOrden(id));
}

/**
 * Decide a qué almacén va el producto terminado.
 *
 * Si el empleado no lo indica, se deduce de la condición de conservación del
 * producto (CU-INV-02). Solo hace falta indicarlo cuando hay más de un almacén
 * compatible, y entonces el sistema lo pide en lugar de elegir por su cuenta.
 */
export async function resolverAlmacenDestino(
  tipoConservacion: string,
  indicado: number | undefined,
  tx: ClientePrisma,
): Promise<number> {
  const compatibles = await ordenModel.almacenesPorConservacion(tipoConservacion, tx);

  if (indicado !== undefined) {
    if (!compatibles.some((a) => a.id_almacen === indicado)) {
      throw new ErrorApp(
        409,
        `El almacén indicado no admite productos de conservación ${tipoConservacion}`,
      );
    }
    return indicado;
  }

  if (compatibles.length === 0) {
    throw new ErrorApp(
      409,
      `No hay ningún almacén de conservación ${tipoConservacion} para recibir el producto`,
    );
  }
  if (compatibles.length > 1) {
    // Con más de un almacén compatible el sistema no elige por su cuenta,
    // salvo que alguien haya designado uno como destino por omisión. Eso
    // devuelve la fluidez del caso de un solo almacén sin quitar la
    // posibilidad de indicar otro cuando el caso lo pida.
    const preferido = compatibles.find((a) => a.preferido);
    if (preferido) return preferido.id_almacen;

    const nombres = compatibles.map((a) => `${a.id_almacen} (${a.nombre})`).join(', ');
    throw new ErrorApp(
      409,
      `Indique el almacén de destino. Compatibles: ${nombres}. ` +
        'Para evitar esta pregunta, marque uno como preferido en Inventario › Almacenes.',
    );
  }
  return compatibles[0].id_almacen;
}

/**
 * En proceso → Finalizada.
 *
 * RF-PRO-07: la nota de egreso por los insumos consumidos, la nota de ingreso
 * por el producto obtenido y la actualización de ambos stocks ocurren en una
 * sola transacción. Si algo falla, no queda nada registrado.
 */
export async function finalizar(
  idUsuario: number,
  id: number,
  datos: DatosFinalizarOrden,
): Promise<OrdenProduccionDTO> {
  const idEmpleado = await exigirEmpleado(idUsuario, ACCION);
  const previa = await exigirOrden(id);
  const estado = previa.estado as EstadoOrden;

  if (!transicionesDeOrden(estado).includes('Finalizada')) {
    throw new ErrorApp(409, `No se puede finalizar una orden en estado ${estado}`);
  }

  await prisma.$transaction(async (tx: ClientePrisma) => {
    // Relectura del estado dentro de la transacción: impide que dos
    // finalizaciones simultáneas generen dos juegos de notas.
    const vigente = await ordenModel.estadoActual(id, tx);
    if (vigente?.estado !== 'En proceso') {
      throw new ErrorApp(409, 'La orden dejó de estar En proceso durante la operación');
    }

    const insumos = calcularInsumos(previa.receta, previa.cantidad);

    // «include» Verificar Disponibilidad de Stock, en el momento de ejecutar.
    const asignaciones = await resolverInsumos(insumos, tx);
    const idAlmacenDestino = await resolverAlmacenDestino(
      previa.receta.producto.tipo_conservacion,
      datos.idAlmacenDestino,
      tx,
    );

    // «include» Gestionar Egreso — insumos consumidos, motivo Producción.
    const idNotaEgreso = await egresoService.registrarEnTransaccion(tx, {
      motivo: MOTIVO_PRODUCCION,
      observacion: `Orden de producción ${previa.id_orden_produccion}`,
      insumos: asignaciones.map((a) => ({
        idItem: a.idProducto,
        idAlmacen: a.idAlmacen,
        cantidad: a.cantidad,
        costoUnitario: 0,
      })),
      productos: [],
      idEmpleado,
    });

    /*
     * Hallazgo H10 — lo que salió de verdad.
     *
     * Los insumos ya se consumieron por lo planificado; lo que puede diferir
     * es cuántas porciones salieron aprovechables. Si no se indica, se asume
     * que salió lo previsto, que es el caso corriente.
     */
    const costoTotal = calcularCosto(insumos);
    const cantidadObtenida = datos.cantidadObtenida ?? previa.cantidad;

    /*
     * El costo se reparte entre lo **obtenido**, no entre lo planificado: si
     * se perdieron tres unidades, las que quedaron cargan con su costo. Eso es
     * lo que convierte el dato en información de costos.
     */
    const costoUnitario =
      cantidadObtenida === 0 ? 0 : dosDecimales(costoTotal / cantidadObtenida);

    /*
     * Con pérdida total no hay nota de ingreso: no entró nada al almacén. El
     * consumo de insumos queda registrado igual, que es justamente lo que hace
     * visible la pérdida en lugar de esconderla.
     */
    const idNotaIngreso =
      cantidadObtenida === 0
        ? null
        : // «include» Gestionar Ingreso — producto terminado, motivo Producción.
          await ingresoService.registrarEnTransaccion(tx, {
            motivo: MOTIVO_PRODUCCION,
            proveedor: null,
            numeroDocumento: `OP-${previa.id_orden_produccion}`,
            insumos: [],
            productos: [
              {
                idItem: previa.receta.producto.id_producto,
                idAlmacen: idAlmacenDestino,
                cantidad: cantidadObtenida,
                costoUnitario,
              },
            ],
            idEmpleado,
          });

    await ordenModel.finalizar(tx, id, {
      idNotaEgreso,
      idNotaIngreso,
      cantidadObtenida,
      costoTotal,
    });
  });

  return aDTO(await exigirOrden(id));
}

/**
 * CU-PRO-04 — Cancelar Orden de Producción.
 *
 * Extiende a CU-PRO-02 bajo la condición de que la orden esté Pendiente o En
 * proceso. La excepción del caso de uso es explícita: si la orden se cancela,
 * no se genera ninguna nota y no se modifica ningún stock. Como el consumo solo
 * ocurre al finalizar, aquí no hay nada que reponer.
 */
export async function cancelar(idUsuario: number, id: number): Promise<OrdenProduccionDTO> {
  await exigirEmpleado(idUsuario, ACCION);
  const orden = await exigirOrden(id);
  const estado = orden.estado as EstadoOrden;

  if (!esOrdenCancelable(estado)) {
    throw new ErrorApp(409, `No se puede cancelar una orden en estado ${estado}`);
  }

  await ordenModel.cambiarEstado(id, 'Cancelada');
  return aDTO(await exigirOrden(id));
}

/* ------------------------------------------------------------------ */
/* Producción al instante                                              */
/* ------------------------------------------------------------------ */

export interface ProduccionInstantanea {
  idOrden: number;
  /** Lo realmente producido; puede superar lo pedido si la receta no es divisible. */
  cantidadProducida: number;
  excedente: number;
  costoUnitario: number;
  idAlmacenDestino: number;
}

/**
 * Redondeo a corridas completas cuando la receta no es divisible.
 *
 * Una bebida escala de forma continua: para tres vasos se usa exactamente el
 * triple. Una bandeja de horno no: si rinde 4 y hacen falta 3, se hornean 4 y
 * una queda en inventario. Producir "tres cuartos de bandeja" no significa
 * nada en la cocina.
 */
export function cantidadAProducir(receta: { rendimiento: number; divisible: boolean }, faltante: number): number {
  if (receta.divisible) return faltante;
  return Math.ceil(faltante / receta.rendimiento) * receta.rendimiento;
}

/**
 * Produce un producto dentro de una transacción ya abierta y devuelve la orden
 * generada, que nace y se cierra en el mismo acto.
 *
 * Se registra como orden de producción real —marcada `instantanea`— y no como
 * un descuento suelto de insumos: el egreso con motivo Producción quedaría
 * huérfano sin una orden que lo respalde, y el reporte de producción dejaría de
 * ver estas elaboraciones.
 */
export async function producirAlInstante(
  tx: ClientePrisma,
  datos: {
    idProducto: number;
    faltante: number;
    idEmpleado: number;
    idAlmacenDestino?: number;
  },
): Promise<ProduccionInstantanea> {
  const receta = await ordenModel.recetaActivaDeProducto(datos.idProducto, tx);
  if (!receta) {
    throw new ErrorApp(
      409,
      'El producto no tiene receta activa: no puede elaborarse y solo se vende de existencias',
    );
  }

  const cantidad = cantidadAProducir(receta, datos.faltante);
  const insumos = calcularInsumos(receta, cantidad);

  // «include» Verificar Disponibilidad de Stock, antes de tocar nada.
  const asignaciones = await resolverInsumos(insumos, tx);
  const idAlmacenDestino = await resolverAlmacenDestino(
    receta.producto.tipo_conservacion,
    datos.idAlmacenDestino,
    tx,
  );

  const orden = await ordenModel.crear(
    { idReceta: receta.id_receta, cantidad, idEmpleado: datos.idEmpleado, instantanea: true },
    tx,
  );

  const idNotaEgreso = await egresoService.registrarEnTransaccion(tx, {
    motivo: MOTIVO_PRODUCCION,
    observacion: `Producción al instante · orden ${orden.id_orden_produccion}`,
    insumos: asignaciones.map((a) => ({
      idItem: a.idProducto,
      idAlmacen: a.idAlmacen,
      cantidad: a.cantidad,
      costoUnitario: 0,
    })),
    productos: [],
    idEmpleado: datos.idEmpleado,
  });

  const costoTotal = calcularCosto(insumos);
  const costoUnitario = dosDecimales(costoTotal / cantidad);

  const idNotaIngreso = await ingresoService.registrarEnTransaccion(tx, {
    motivo: MOTIVO_PRODUCCION,
    proveedor: null,
    numeroDocumento: `OP-${orden.id_orden_produccion}`,
    insumos: [],
    productos: [
      {
        idItem: receta.producto.id_producto,
        idAlmacen: idAlmacenDestino,
        cantidad,
        costoUnitario,
      },
    ],
    idEmpleado: datos.idEmpleado,
  });

  /*
   * En la producción al instante no hay merma que informar: la corrida ocurre
   * dentro de la venta y lo obtenido es, por definición, lo que se produjo
   * para cubrirla. Se registra igual para que el historial de todas las
   * órdenes tenga la misma forma.
   */
  await ordenModel.finalizar(tx, orden.id_orden_produccion, {
    idNotaEgreso,
    idNotaIngreso,
    cantidadObtenida: cantidad,
    costoTotal,
  });

  return {
    idOrden: orden.id_orden_produccion,
    cantidadProducida: cantidad,
    excedente: dosDecimales(cantidad - datos.faltante),
    costoUnitario,
    idAlmacenDestino,
  };
}

export interface SimulacionProduccion {
  producible: boolean;
  motivo?: string;
  cantidadAProducir: number;
  excedente: number;
  insumos: InsumoRequeridoDTO[];
  costo: number;
  almacenesCompatibles: { id: number; nombre: string }[];
  /** Insumos que no alcanzan, con lo que hay y lo que haría falta. */
  insumosFaltantes: { nombre: string; unidad: string; requerido: number; disponible: number }[];
}

/**
 * Insumos que consumiría producir una cantidad, sin ejecutar nada.
 *
 * Comprueba **tres** condiciones, y las tres tienen que dar el mismo veredicto
 * que dará la ejecución: que exista receta activa, que haya dónde guardar el
 * producto y que los insumos alcancen. Antes solo miraba las dos primeras, de
 * modo que el mostrador podía anunciar "se preparará al instante", mostrar la
 * lista de insumos, habilitar el botón, y recién al confirmar fallar con
 * "insumos insuficientes". Una previsualización que promete lo que la
 * ejecución rechaza es peor que no tener previsualización.
 *
 * Devuelve además los almacenes compatibles para que la interfaz pueda pedir
 * el destino *antes* de confirmar, en lugar de descubrir al guardar que hacía
 * falta elegirlo.
 */
export async function simularProduccion(
  idProducto: number,
  faltante: number,
): Promise<SimulacionProduccion> {
  const receta = await ordenModel.recetaActivaDeProducto(idProducto);
  if (!receta) {
    return {
      producible: false,
      motivo: 'El producto no tiene receta activa: solo puede venderse de existencias',
      cantidadAProducir: 0,
      excedente: 0,
      insumos: [],
      costo: 0,
      almacenesCompatibles: [],
      insumosFaltantes: [],
    };
  }

  const cantidad = cantidadAProducir(receta, faltante);
  const insumos = calcularInsumos(receta, cantidad);

  const almacenes = await ordenModel.almacenesPorConservacion(
    receta.producto.tipo_conservacion,
    prisma,
  );

  // La misma comprobación que hará la ejecución, sobre los mismos datos.
  const { faltantes } = await asignarInsumos(
    insumos.map((i) => ({ idItem: i.idIngrediente, cantidad: i.cantidadRequerida })),
    prisma,
  );
  const datosDe = new Map(insumos.map((i) => [i.idIngrediente, i]));
  const insumosFaltantes = faltantes.map((f) => {
    const insumo = datosDe.get(f.idItem)!;
    return {
      nombre: insumo.nombre,
      unidad: insumo.unidad,
      requerido: f.solicitado,
      disponible: f.disponible,
    };
  });

  const sinAlmacen = almacenes.length === 0;

  return {
    producible: !sinAlmacen && insumosFaltantes.length === 0,
    motivo: sinAlmacen
      ? `No hay ningún almacén de conservación ${receta.producto.tipo_conservacion} para recibir el producto`
      : insumosFaltantes.length > 0
        ? `Insumos insuficientes: ${insumosFaltantes
            .map((i) => `${i.nombre} (hay ${i.disponible} ${i.unidad}, hacen falta ${i.requerido})`)
            .join('; ')}`
        : undefined,
    cantidadAProducir: cantidad,
    excedente: dosDecimales(cantidad - faltante),
    insumos,
    costo: calcularCosto(insumos),
    almacenesCompatibles: almacenes.map((a) => ({ id: a.id_almacen, nombre: a.nombre })),
    insumosFaltantes,
  };
}
