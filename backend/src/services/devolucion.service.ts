import { prisma } from '../config/prisma.js';
import * as ingresoModel from '../models/nota-ingreso.model.js';
import * as egresoModel from '../models/nota-egreso.model.js';
import * as stockModel from '../models/stock.model.js';
import type { ClientePrisma } from '../models/stock.model.js';
import type { CompraConsultada } from '../models/nota-ingreso.model.js';
import type {
  DocumentoVinculableDTO,
  LineaVinculableDTO,
} from '../dtos/movimiento.dto.js';
import type { LineaConsolidada } from './movimiento.comun.js';
import { diaDe } from './movimiento.mapper.js';
import { exigirEmpleado } from './actor.service.js';
import { MOTIVO_COMPRA, MOTIVO_DEVOLUCION } from '../config/dominio.js';
import { ErrorApp } from '../errors/error-app.js';
import { formatearCantidad, redondearCantidad } from '../utils/cantidad.js';

/**
 * Compra → Devolución → Reposición (CU-INV-03 y CU-INV-04).
 *
 * Cuando un proveedor trae algo vencido o dañado, el negocio se lo devuelve
 * con una nota de egreso por **Devolución**, y el proveedor lo repone: nota de
 * ingreso por **Reposición**. Sueltas, las dos notas no decían de qué compra
 * era lo devuelto ni qué devolución se reponía, y nada impedía devolver más de
 * lo que se compró o reponer dos veces lo mismo. Encadenadas:
 *
 * - la devolución indica su compra (`nota_egreso.id_nota_ingreso`) y solo saca
 *   lo que entró en ella, del mismo almacén, hasta lo que falta devolver. Si es
 *   un perecedero, sale del lote de esa compra y no del que vence antes;
 * - la reposición indica su devolución (`nota_ingreso.id_nota_egreso`) y solo
 *   repone lo que salió, hasta lo que falta reponer, al precio de la compra.
 */

/** Cuántos documentos ofrece el formulario. El selector los busca por nombre. */
const TOPE_DOCUMENTOS = 100;

const numeroIngreso = (id: number) => `ING-${String(id).padStart(4, '0')}`;
const numeroEgreso = (id: number) => `EGR-${String(id).padStart(4, '0')}`;

/** Una línea se identifica por ítem y almacén: es la clave de los detalles. */
const clave = (tipo: 'insumo' | 'producto', id: number, idAlmacen: number) =>
  `${tipo}:${id}@${idAlmacen}`;

type Detalles = {
  detalle_egreso_insumo?: { id_ingrediente: number; id_almacen: number; cantidad: unknown }[];
  detalle_egreso_producto?: { id_producto: number; id_almacen: number; cantidad: number }[];
  detalle_ingreso_insumo?: { id_ingrediente: number; id_almacen: number; cantidad: unknown }[];
  detalle_ingreso_producto?: { id_producto: number; id_almacen: number; cantidad: number }[];
};

/** Suma lo que movieron unas notas, por documento de origen y línea. */
function sumarPor<T extends Detalles>(notas: T[], origen: (nota: T) => number | null) {
  const suma = new Map<string, number>();
  const sumar = (idOrigen: number, k: string, cantidad: number) => {
    const llave = `${idOrigen}|${k}`;
    suma.set(llave, redondearCantidad((suma.get(llave) ?? 0) + cantidad));
  };
  for (const nota of notas) {
    const idOrigen = origen(nota);
    if (idOrigen === null) continue;
    for (const d of [...(nota.detalle_egreso_insumo ?? []), ...(nota.detalle_ingreso_insumo ?? [])]) {
      sumar(idOrigen, clave('insumo', d.id_ingrediente, d.id_almacen), Number(d.cantidad));
    }
    for (const d of [
      ...(nota.detalle_egreso_producto ?? []),
      ...(nota.detalle_ingreso_producto ?? []),
    ]) {
      sumar(idOrigen, clave('producto', d.id_producto, d.id_almacen), d.cantidad);
    }
  }
  return (idOrigen: number, k: string) => suma.get(`${idOrigen}|${k}`) ?? 0;
}

/** Las líneas de una compra, con su precio y, si es perecedero, su lote. */
function lineasDeCompra(compra: CompraConsultada) {
  return [
    ...compra.detalle_ingreso_insumo.map((d) => ({
      tipo: 'insumo' as const,
      id: d.id_ingrediente,
      nombre: d.ingrediente_almacen.ingrediente.nombre,
      unidad: d.ingrediente_almacen.ingrediente.unidad_medida.abreviatura,
      idAlmacen: d.id_almacen,
      almacen: d.ingrediente_almacen.almacen.nombre,
      cantidad: Number(d.cantidad),
      costoUnitario: Number(d.costo_unitario),
      controlaVencimiento: d.ingrediente_almacen.ingrediente.controla_vencimiento,
      idLote: d.id_lote,
      lote: d.lote,
    })),
    ...compra.detalle_ingreso_producto.map((d) => ({
      tipo: 'producto' as const,
      id: d.id_producto,
      nombre: d.producto_almacen.producto.nombre,
      unidad: 'u',
      idAlmacen: d.id_almacen,
      almacen: d.producto_almacen.almacen.nombre,
      cantidad: d.cantidad,
      costoUnitario: Number(d.costo_unitario),
      controlaVencimiento: false,
      idLote: null,
      lote: null,
    })),
  ];
}

/* ------------------------------------------------------------------ */
/* Lo que el formulario ofrece                                         */
/* ------------------------------------------------------------------ */

/**
 * Las compras que todavía tienen algo que devolver, con lo que falta devolver
 * de cada línea y lo que hay hoy para sacar.
 */
export async function comprasDevolubles(idUsuario: number): Promise<DocumentoVinculableDTO[]> {
  await exigirEmpleado(idUsuario, 'registrar devoluciones al proveedor');

  const compras = await ingresoModel.comprasRecientes(TOPE_DOCUMENTOS);
  const devuelto = sumarPor(
    await egresoModel.devueltoDe(compras.map((c) => c.id_nota_ingreso)),
    (n) => n.id_nota_ingreso,
  );

  // Lo que hay hoy de cada ítem en cada almacén: no se devuelve lo que no está.
  const lineas = compras.flatMap(lineasDeCompra);
  const [insumos, productos] = await Promise.all([
    stockModel.existenciasDeInsumos([...new Set(lineas.filter((l) => l.tipo === 'insumo').map((l) => l.id))], prisma),
    stockModel.existenciasDeProductos([...new Set(lineas.filter((l) => l.tipo === 'producto').map((l) => l.id))], prisma),
  ]);
  const hay = new Map<string, number>([
    ...insumos.map((e) => [clave('insumo', e.id_ingrediente, e.id_almacen), Number(e.stock_actual)] as const),
    ...productos.map((e) => [clave('producto', e.id_producto, e.id_almacen), e.stock_actual] as const),
  ]);

  return compras
    .map((compra) => ({
      id: compra.id_nota_ingreso,
      fecha: compra.fecha.toISOString(),
      proveedor: compra.proveedor,
      numeroDocumento: compra.numero_documento,
      idCompra: null,
      observacion: null,
      lineas: lineasDeCompra(compra)
        .map<LineaVinculableDTO>((l) => {
          const k = clave(l.tipo, l.id, l.idAlmacen);
          const vinculado = devuelto(compra.id_nota_ingreso, k);
          // Del perecedero se devuelve su lote: lo que queda de él, no del ítem.
          const queda = l.lote?.lote_almacen.find((la) => la.id_almacen === l.idAlmacen);
          return {
            tipo: l.tipo,
            id: l.id,
            nombre: l.nombre,
            unidad: l.unidad,
            idAlmacen: l.idAlmacen,
            almacen: l.almacen,
            cantidad: l.cantidad,
            vinculado,
            pendiente: redondearCantidad(Math.max(0, l.cantidad - vinculado)),
            existencia: l.lote ? Number(queda?.stock_actual ?? 0) : (hay.get(k) ?? 0),
            costoUnitario: l.costoUnitario,
            controlaVencimiento: l.controlaVencimiento,
            lote: l.lote
              ? {
                  codigo: l.lote.codigo,
                  vencimiento: diaDe(l.lote.fecha_vencimiento),
                  queda: Number(queda?.stock_actual ?? 0),
                }
              : null,
          };
        })
        .filter((l) => l.pendiente > 0),
    }))
    .filter((c) => c.lineas.length > 0);
}

/**
 * Las devoluciones al proveedor que todavía tienen algo por reponer, con el
 * precio de la compra de la que salieron.
 */
export async function devolucionesReponibles(
  idUsuario: number,
): Promise<DocumentoVinculableDTO[]> {
  await exigirEmpleado(idUsuario, 'registrar reposiciones del proveedor');

  const devoluciones = await egresoModel.devolucionesRecientes(TOPE_DOCUMENTOS);
  const compras = new Map(
    (
      await ingresoModel.comprasPorId([
        ...new Set(devoluciones.map((d) => d.id_nota_ingreso!).filter(Boolean)),
      ])
    ).map((c) => [c.id_nota_ingreso, c]),
  );
  const repuesto = sumarPor(
    await ingresoModel.repuestoDe(devoluciones.map((d) => d.id_nota_egreso)),
    (n) => n.id_nota_egreso,
  );

  return devoluciones
    .map((devolucion) => {
      const compra = compras.get(devolucion.id_nota_ingreso!);
      const precio = precioDeCompra(compra);
      const lineas = [
        ...devolucion.detalle_egreso_insumo.map((d) => ({
          tipo: 'insumo' as const,
          id: d.id_ingrediente,
          nombre: d.ingrediente_almacen.ingrediente.nombre,
          unidad: d.ingrediente_almacen.ingrediente.unidad_medida.abreviatura,
          idAlmacen: d.id_almacen,
          almacen: d.ingrediente_almacen.almacen.nombre,
          cantidad: Number(d.cantidad),
          controlaVencimiento: d.ingrediente_almacen.ingrediente.controla_vencimiento,
        })),
        ...devolucion.detalle_egreso_producto.map((d) => ({
          tipo: 'producto' as const,
          id: d.id_producto,
          nombre: d.producto_almacen.producto.nombre,
          unidad: 'u',
          idAlmacen: d.id_almacen,
          almacen: d.producto_almacen.almacen.nombre,
          cantidad: d.cantidad,
          controlaVencimiento: false,
        })),
      ];

      return {
        id: devolucion.id_nota_egreso,
        fecha: devolucion.fecha.toISOString(),
        proveedor: compra?.proveedor ?? null,
        numeroDocumento: compra?.numero_documento ?? null,
        idCompra: devolucion.id_nota_ingreso,
        observacion: devolucion.observacion,
        lineas: lineas
          .map<LineaVinculableDTO>((l) => {
            const vinculado = repuesto(devolucion.id_nota_egreso, clave(l.tipo, l.id, l.idAlmacen));
            return {
              ...l,
              vinculado,
              pendiente: redondearCantidad(Math.max(0, l.cantidad - vinculado)),
              existencia: null,
              costoUnitario: precio(l.tipo, l.id, l.idAlmacen),
              lote: null,
            };
          })
          .filter((l) => l.pendiente > 0),
      };
    })
    .filter((d) => d.lineas.length > 0);
}

/** El precio que se pagó por un ítem en la compra: el de su línea, o el de otra del mismo ítem. */
function precioDeCompra(compra: CompraConsultada | undefined) {
  const lineas = compra ? lineasDeCompra(compra) : [];
  return (tipo: 'insumo' | 'producto', id: number, idAlmacen: number) =>
    (
      lineas.find((l) => l.tipo === tipo && l.id === id && l.idAlmacen === idAlmacen) ??
      lineas.find((l) => l.tipo === tipo && l.id === id)
    )?.costoUnitario ?? 0;
}

/* ------------------------------------------------------------------ */
/* Lo que el servidor comprueba al registrar                           */
/* ------------------------------------------------------------------ */

interface LineasDeNota {
  insumos: LineaConsolidada[];
  productos: LineaConsolidada[];
}

const todas = ({ insumos, productos }: LineasDeNota) => [
  ...insumos.map((l) => ({ tipo: 'insumo' as const, ...l })),
  ...productos.map((l) => ({ tipo: 'producto' as const, ...l })),
];

/**
 * Una devolución al proveedor solo saca lo que entró en su compra, del mismo
 * almacén y hasta lo que falta devolver.
 *
 * Devuelve el lote de la compra de cada perecedero —por `idItem@idAlmacen`—:
 * lo devuelto sale de ese lote, que es el que llegó vencido o dañado, y no
 * del que vence antes.
 */
export async function validarDevolucion(
  tx: ClientePrisma,
  idCompra: number,
  lineas: LineasDeNota,
): Promise<Map<string, number>> {
  const [compra] = await ingresoModel.comprasPorId([idCompra], tx);
  if (!compra) throw new ErrorApp(404, 'La compra que se quiere devolver no existe');
  if (compra.motivo !== MOTIVO_COMPRA) {
    throw new ErrorApp(409, `${numeroIngreso(idCompra)} no es una compra: solo se le devuelve al proveedor lo comprado`);
  }

  const entro = new Map(lineasDeCompra(compra).map((l) => [clave(l.tipo, l.id, l.idAlmacen), l]));
  const devuelto = sumarPor(await egresoModel.devueltoDe([idCompra], tx), (n) => n.id_nota_ingreso);
  const lotes = new Map<string, number>();

  for (const linea of todas(lineas)) {
    const k = clave(linea.tipo, linea.idItem, linea.idAlmacen);
    const comprado = entro.get(k);
    if (!comprado) {
      throw new ErrorApp(
        400,
        `Solo se devuelve lo que entró en la compra ${numeroIngreso(idCompra)}, y del almacén donde entró`,
      );
    }
    const pendiente = redondearCantidad(comprado.cantidad - devuelto(idCompra, k));
    if (linea.cantidad > pendiente) {
      throw new ErrorApp(
        409,
        `De ${comprado.nombre} quedan por devolver ${formatearCantidad(pendiente)} ${comprado.unidad} de la compra ${numeroIngreso(idCompra)}`,
      );
    }
    if (comprado.idLote !== null) lotes.set(`${linea.idItem}@${linea.idAlmacen}`, comprado.idLote);
  }
  return lotes;
}

/**
 * Una reposición solo repone lo que salió en su devolución, hasta lo que falta
 * reponer, y al precio que se pagó en la compra: vuelve lo que ya se había
 * pagado. Devuelve ese precio por línea y los datos del proveedor.
 */
export async function validarReposicion(
  tx: ClientePrisma,
  idDevolucion: number,
  lineas: LineasDeNota,
): Promise<{
  precio: (tipo: 'insumo' | 'producto', id: number, idAlmacen: number) => number;
  proveedor: string | null;
}> {
  const devolucion = await egresoModel.buscarDevolucion(tx, idDevolucion);
  if (!devolucion) throw new ErrorApp(404, 'La devolución que se quiere reponer no existe');
  if (devolucion.motivo !== MOTIVO_DEVOLUCION || devolucion.id_nota_ingreso === null) {
    throw new ErrorApp(
      409,
      `${numeroEgreso(idDevolucion)} no es una devolución a un proveedor: no hay nada que reponer`,
    );
  }

  const salio = sumarPor([devolucion], () => idDevolucion);
  const repuesto = sumarPor(await ingresoModel.repuestoDe([idDevolucion], tx), (n) => n.id_nota_egreso);
  const [compra] = await ingresoModel.comprasPorId([devolucion.id_nota_ingreso], tx);
  const nombres = new Map(
    (compra ? lineasDeCompra(compra) : []).map((l) => [clave(l.tipo, l.id, l.idAlmacen), l]),
  );

  for (const linea of todas(lineas)) {
    const k = clave(linea.tipo, linea.idItem, linea.idAlmacen);
    const devuelto = salio(idDevolucion, k);
    if (devuelto === 0) {
      throw new ErrorApp(
        400,
        `Solo se repone lo que salió en la devolución ${numeroEgreso(idDevolucion)}, en el almacén de donde salió`,
      );
    }
    const pendiente = redondearCantidad(devuelto - repuesto(idDevolucion, k));
    if (linea.cantidad > pendiente) {
      const item = nombres.get(k);
      throw new ErrorApp(
        409,
        `De ${item?.nombre ?? 'ese ítem'} quedan por reponer ${formatearCantidad(pendiente)} ${item?.unidad ?? ''} de la devolución ${numeroEgreso(idDevolucion)}`.trim(),
      );
    }
  }

  return { precio: precioDeCompra(compra), proveedor: compra?.proveedor ?? null };
}
