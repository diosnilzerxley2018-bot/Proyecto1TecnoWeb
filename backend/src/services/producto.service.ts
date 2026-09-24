import * as productoModel from '../models/producto.model.js';
import type { ProductoGestion } from '../models/producto.model.js';
import type {
  DatosActualizarProducto,
  DatosCrearProducto,
  DatosValorNutricional,
  FiltroProductosDTO,
  ProductoGestionDTO,
} from '../dtos/producto.dto.js';
import type { ValorNutricionalDTO } from '../dtos/comun.dto.js';
import { ErrorApp } from '../errors/error-app.js';
import type { TipoConservacion } from '../config/dominio.js';
import { tipoRealDeImagen } from '../utils/imagen.js';

/**
 * CU-PRO-01 — Gestionar Producto y Receta (parte de producto), y
 * CU-PRO-03 — Registrar Valor Nutricional, que lo extiende y es opcional.
 */

function aValorNutricional(
  valor: ProductoGestion['valor_nutricional'],
): ValorNutricionalDTO | null {
  if (!valor) return null;
  return {
    calorias: valor.calorias,
    proteinas: Number(valor.proteinas_g),
    carbohidratos: Number(valor.carbohidratos_g),
    grasas: Number(valor.grasas_g),
    fibra: valor.fibra_g === null ? null : Number(valor.fibra_g),
  };
}

function aDTO(producto: ProductoGestion): ProductoGestionDTO {
  const existencias = producto.producto_almacen.map((e) => ({
    idAlmacen: e.almacen.id_almacen,
    almacen: e.almacen.nombre,
    stock: e.stock_actual,
  }));

  return {
    id: producto.id_producto,
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    precio: Number(producto.precio_venta),
    activo: producto.activo,
    tipoConservacion: producto.tipo_conservacion as TipoConservacion,
    categoria: { id: producto.categoria.id_categoria, nombre: producto.categoria.nombre },
    valorNutricional: aValorNutricional(producto.valor_nutricional),
    stockTotal: existencias.reduce((total, e) => total + e.stock, 0),
    existencias,
    // El listado no los calcula: sería una consulta por producto para un dato
    // que solo se mira en la ficha. `conCosto` los completa allí.
    costoPromedio: null,
    vendeBajoCosto: false,
    imagenActualizadaEn: producto.imagen_actualizada_en?.toISOString() ?? null,
  };
}

/**
 * Completa el costo promedio del producto.
 *
 * Se aplica solo en la ficha individual. Hacerlo también en el listado
 * costaría una consulta por producto para un dato que ahí no se muestra.
 */
async function conCosto(dto: ProductoGestionDTO): Promise<ProductoGestionDTO> {
  const costo = await productoModel.costoPromedio(dto.id);
  return {
    ...dto,
    costoPromedio: costo,
    vendeBajoCosto: costo !== null && dto.precio < costo,
  };
}

async function exigirProducto(id: number): Promise<ProductoGestion> {
  const producto = await productoModel.buscarParaGestion(id);
  if (!producto) throw new ErrorApp(404, 'El producto no existe');
  return producto;
}

/** CU-PRO-01, precondición: deben existir categorías previamente registradas. */
async function exigirCategoria(idCategoria: number): Promise<void> {
  const categoria = await productoModel.buscarCategoria(idCategoria);
  if (!categoria) throw new ErrorApp(404, 'La categoría indicada no existe');
}

export async function listar(filtro: FiltroProductosDTO): Promise<ProductoGestionDTO[]> {
  const productos = await productoModel.listarParaGestion({
    termino: filtro.termino,
    idCategoria: filtro.categoria,
    incluirInactivos: filtro.incluirInactivos,
  });
  return productos.map(aDTO);
}

export async function obtener(id: number): Promise<ProductoGestionDTO> {
  return conCosto(aDTO(await exigirProducto(id)));
}

export async function crear(datos: DatosCrearProducto): Promise<ProductoGestionDTO> {
  await exigirCategoria(datos.idCategoria);
  const creado = await productoModel.crear({
    nombre: datos.nombre,
    descripcion: datos.descripcion ?? null,
    precioVenta: datos.precioVenta,
    idCategoria: datos.idCategoria,
    tipoConservacion: datos.tipoConservacion,
  });
  return aDTO(await exigirProducto(creado.id_producto));
}

export async function actualizar(
  id: number,
  datos: DatosActualizarProducto,
): Promise<ProductoGestionDTO> {
  await exigirProducto(id);
  if (datos.idCategoria !== undefined) await exigirCategoria(datos.idCategoria);
  await productoModel.actualizar(id, datos);
  return aDTO(await exigirProducto(id));
}

/**
 * CU-PRO-01, excepciones: si el producto tiene ventas o pedidos registrados, el
 * sistema no permite eliminarlo y ofrece darlo de baja lógicamente.
 *
 * Se comprueban además las existencias y las recetas: son claves foráneas que
 * bloquearían el borrado igualmente, y conviene explicarlo antes de que el
 * motor devuelva un error sin contexto.
 */
export async function eliminar(id: number): Promise<void> {
  await exigirProducto(id);

  const { ventas, pedidos } = await productoModel.contarOperaciones(id);
  if (ventas > 0 || pedidos > 0) {
    throw new ErrorApp(
      409,
      `No se puede eliminar el producto porque tiene ${ventas} venta(s) y ${pedidos} pedido(s) registrados. Puede darlo de baja en su lugar.`,
    );
  }

  const [existencias, recetas] = await Promise.all([
    productoModel.contarExistencias(id),
    productoModel.contarRecetas(id),
  ]);
  if (existencias > 0 || recetas > 0) {
    throw new ErrorApp(
      409,
      'No se puede eliminar el producto porque registra existencias o tiene recetas asociadas. Puede darlo de baja en su lugar.',
    );
  }

  await productoModel.eliminar(id);
}

/**
 * CU-PRO-03 — Registrar Valor Nutricional.
 *
 * Es una extensión: el producto existe con o sin ella, y puede registrarse en
 * el momento del alta o mucho después. Por eso es una operación aparte y no un
 * campo obligatorio del producto.
 */
export async function guardarValorNutricional(
  idProducto: number,
  datos: DatosValorNutricional,
): Promise<ProductoGestionDTO> {
  await exigirProducto(idProducto);
  await productoModel.guardarValorNutricional(idProducto, {
    calorias: datos.calorias,
    proteinas: datos.proteinas,
    carbohidratos: datos.carbohidratos,
    grasas: datos.grasas,
    fibra: datos.fibra ?? null,
  });
  return aDTO(await exigirProducto(idProducto));
}

/**
 * Guarda la foto de un producto (RF-PRO extensión opcional, como el valor
 * nutricional: el producto existe con o sin ella).
 *
 * El tipo que se guarda es el que devuelve `tipoRealDeImagen`, mirando los
 * primeros bytes del archivo — nunca el `mimetype` que declaró quien lo
 * subió, que es un dato del cliente y no una verdad del servidor.
 */
export async function guardarImagen(id: number, datos: Buffer): Promise<ProductoGestionDTO> {
  await exigirProducto(id);

  const tipo = tipoRealDeImagen(datos);
  if (!tipo) {
    throw new ErrorApp(
      415,
      'El archivo no es una imagen JPEG, PNG o WEBP válida.',
    );
  }

  await productoModel.guardarImagen(id, datos, tipo);
  return aDTO(await exigirProducto(id));
}

export async function eliminarImagen(id: number): Promise<ProductoGestionDTO> {
  await exigirProducto(id);
  await productoModel.eliminarImagen(id);
  return aDTO(await exigirProducto(id));
}
