import * as insumoModel from '../models/insumo.model.js';
import * as productoModel from '../models/producto.model.js';
import * as almacenModel from '../models/almacen.model.js';
import type { ClientePrisma } from '../models/stock.model.js';
import { ErrorApp } from '../errors/error-app.js';
import { dosDecimales } from '../utils/dinero.js';

/** Reglas comunes a CU-INV-03 Gestionar Ingreso y CU-INV-04 Gestionar Egreso. */

export interface DatosLoteLinea {
  codigo: string | null;
  fechaVencimiento: Date;
}

export interface LineaBruta {
  idItem: number;
  idAlmacen: number;
  cantidad: number;
  costoUnitario?: number;
  lote?: DatosLoteLinea | null;
}

export interface LineaConsolidada {
  idItem: number;
  idAlmacen: number;
  cantidad: number;
  costoUnitario: number;
  lote?: DatosLoteLinea | null;
}

/** Redondeo a dos decimales, la precisión que declaran las columnas NUMERIC(_,2). */

/**
 * Agrupa las líneas repetidas del mismo ítem en el mismo almacén.
 *
 * La clave primaria de los cuatro detalles es (nota, ítem, almacén), de modo
 * que dos líneas iguales colisionarían. Cuando las líneas llevan costo, el
 * costo resultante es el promedio ponderado por cantidad: así el total de la
 * nota —suma de cantidad por costo— no cambia al agrupar.
 */
export function consolidar(lineas: LineaBruta[]): LineaConsolidada[] {
  const acumulado = new Map<string, { linea: LineaConsolidada; importe: number }>();

  for (const linea of lineas) {
    const clave = `${linea.idItem}:${linea.idAlmacen}`;
    const costo = linea.costoUnitario ?? 0;
    const existente = acumulado.get(clave);

    if (existente) {
      /**
       * La clave primaria del detalle es (nota, ítem, almacén): una nota no
       * puede llevar dos lotes del mismo insumo en el mismo almacén. Recibir
       * dos lotes distintos exige dos notas, que además es lo correcto desde
       * el punto de vista documental.
       */
      const previo = existente.linea.lote;
      const nuevo = linea.lote ?? null;
      const distintos =
        (previo?.codigo ?? null) !== (nuevo?.codigo ?? null) ||
        previo?.fechaVencimiento?.getTime() !== nuevo?.fechaVencimiento?.getTime();

      if ((previo || nuevo) && distintos) {
        throw new ErrorApp(
          409,
          'Una misma nota no puede recibir dos lotes distintos del mismo insumo en el mismo almacén. Registre una nota por lote.',
        );
      }

      existente.linea.cantidad += linea.cantidad;
      existente.importe += linea.cantidad * costo;
    } else {
      acumulado.set(clave, {
        linea: {
          idItem: linea.idItem,
          idAlmacen: linea.idAlmacen,
          cantidad: linea.cantidad,
          costoUnitario: costo,
          lote: linea.lote ?? null,
        },
        importe: linea.cantidad * costo,
      });
    }
  }

  return [...acumulado.values()].map(({ linea, importe }) => ({
    ...linea,
    cantidad: dosDecimales(linea.cantidad),
    costoUnitario: linea.cantidad > 0 ? dosDecimales(importe / linea.cantidad) : 0,
  }));
}

/** Total de la nota: suma de cantidad por costo unitario de cada línea. */
export function calcularTotal(lineas: LineaConsolidada[]): number {
  return dosDecimales(
    lineas.reduce((suma, l) => suma + Math.round(l.cantidad * l.costoUnitario * 100) / 100, 0),
  );
}

function faltantes(pedidos: number[], encontrados: Set<number>): number[] {
  return [...new Set(pedidos)].filter((id) => !encontrados.has(id));
}

interface ItemReferenciado {
  nombre: string;
  tipoConservacion: string;
}

/**
 * Comprueba que cada ítem pueda guardarse en el almacén indicado.
 *
 * CU-INV-02: "El tipo de conservación determina qué insumos y productos pueden
 * almacenarse en cada almacén. Al no existir traspasos entre almacenes, cada
 * insumo y producto permanece en el almacén que corresponde a su condición."
 *
 * Solo aplica al ingreso, que es donde se decide el destino. Un egreso saca lo
 * que ya está guardado: ahí no hay destino que elegir.
 */
function verificarConservacion(
  lineas: LineaConsolidada[],
  items: Map<number, ItemReferenciado>,
  almacenes: Map<number, { nombre: string; tipoConservacion: string }>,
  etiqueta: string,
): string[] {
  return lineas.flatMap((linea) => {
    const item = items.get(linea.idItem);
    const almacen = almacenes.get(linea.idAlmacen);
    if (!item || !almacen || item.tipoConservacion === almacen.tipoConservacion) return [];
    return [
      `el ${etiqueta} "${item.nombre}" requiere conservación ${item.tipoConservacion} ` +
        `y el almacén "${almacen.nombre}" es ${almacen.tipoConservacion}`,
    ];
  });
}

/**
 * Comprueba que los insumos, productos y almacenes referenciados existan y,
 * cuando corresponde, que la condición de conservación sea compatible.
 *
 * `exigirActivos` distingue los dos casos de uso: un ingreso de un ítem dado
 * de baja contradice la baja —se dejó de utilizar—, mientras que un egreso por
 * merma o ajuste es justamente la vía para vaciar del almacén lo que ya no se
 * usa, de modo que ahí no se exige que esté activo.
 */
export async function exigirReferenciasValidas(
  datos: {
    insumos: LineaConsolidada[];
    productos: LineaConsolidada[];
    exigirActivos: boolean;
    validarConservacion: boolean;
  },
  tx: ClientePrisma,
): Promise<void> {
  const idsInsumo = datos.insumos.map((l) => l.idItem);
  const idsProducto = datos.productos.map((l) => l.idItem);
  const idsAlmacen = [...datos.insumos, ...datos.productos].map((l) => l.idAlmacen);

  const [insumos, productos, almacenes] = [
    idsInsumo.length > 0 ? await insumoModel.existentes(idsInsumo, tx, datos.exigirActivos) : [],
    idsProducto.length > 0
      ? await productoModel.existentes(idsProducto, tx, datos.exigirActivos)
      : [],
    idsAlmacen.length > 0 ? await almacenModel.existentes(idsAlmacen, tx) : [],
  ];

  const problemas: string[] = [];

  const insumosFaltantes = faltantes(idsInsumo, new Set(insumos.map((i) => i.id_ingrediente)));
  if (insumosFaltantes.length > 0) {
    problemas.push(`insumos inexistentes o dados de baja: ${insumosFaltantes.join(', ')}`);
  }

  const productosFaltantes = faltantes(idsProducto, new Set(productos.map((p) => p.id_producto)));
  if (productosFaltantes.length > 0) {
    problemas.push(`productos inexistentes o dados de baja: ${productosFaltantes.join(', ')}`);
  }

  const almacenesFaltantes = faltantes(idsAlmacen, new Set(almacenes.map((a) => a.id_almacen)));
  if (almacenesFaltantes.length > 0) {
    problemas.push(`almacenes inexistentes: ${almacenesFaltantes.join(', ')}`);
  }

  if (problemas.length > 0) {
    throw new ErrorApp(404, `La nota referencia datos inválidos. Hay ${problemas.join('; ')}`);
  }

  if (!datos.validarConservacion) return;

  const mapaAlmacenes = new Map(
    almacenes.map((a) => [a.id_almacen, { nombre: a.nombre, tipoConservacion: a.tipo_conservacion }]),
  );

  const incompatibles = [
    ...verificarConservacion(
      datos.insumos,
      new Map(
        insumos.map((i) => [
          i.id_ingrediente,
          { nombre: i.nombre, tipoConservacion: i.tipo_conservacion },
        ]),
      ),
      mapaAlmacenes,
      'insumo',
    ),
    ...verificarConservacion(
      datos.productos,
      new Map(
        productos.map((p) => [
          p.id_producto,
          { nombre: p.nombre, tipoConservacion: p.tipo_conservacion },
        ]),
      ),
      mapaAlmacenes,
      'producto',
    ),
  ];

  if (incompatibles.length > 0) {
    throw new ErrorApp(409, `Conservación incompatible: ${incompatibles.join('; ')}`);
  }
}
