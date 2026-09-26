import * as almacenModel from '../models/almacen.model.js';
import * as clienteModel from '../models/cliente.model.js';
import * as insumoModel from '../models/insumo.model.js';
import * as ordenModel from '../models/orden-produccion.model.js';
import * as pedidoModel from '../models/pedido.model.js';
import * as permisoModel from '../models/permiso.model.js';
import * as productoModel from '../models/producto.model.js';
import * as usuarioModel from '../models/usuario.model.js';
import * as ventaModel from '../models/venta.model.js';
import { exigirEmpleado } from './actor.service.js';
import { palabrasDe } from '../utils/texto.js';
import { formatearCantidad, redondearCantidad } from '../utils/cantidad.js';
import type {
  BusquedaGeneralDTO,
  ResultadoGeneralDTO,
  TipoResultado,
} from '../dtos/busqueda.dto.js';

/**
 * Buscador general del escritorio del personal.
 *
 * Una sola caja para llegar a cualquier cosa —un pedido por su número, un
 * cliente por su nombre, un insumo, un almacén— sin saber antes en qué
 * pantalla vive. La búsqueda de cada listado sigue existiendo; esta es la de
 * «no sé dónde está».
 */

/** Cuántos resultados de cada tipo: el buscador es para saltar, no para listar. */
const TOPE = 5;

/** Lo que se busca, ya interpretado. */
interface Busqueda {
  termino: string;
  /** Si se escribió un número («12» o «#12»), para buscar por identificador. */
  numero: number | null;
}

/**
 * De dónde sale cada tipo de resultado y qué permiso pide.
 *
 * El permiso es **el mismo que protege el listado de ese tipo**: el buscador
 * no muestra nada que su pantalla no mostraría. Se declara como tabla por la
 * misma razón que las transiciones de estado: agregar un tipo es agregar una
 * fila, y la regla de acceso se lee de un vistazo.
 */
const FUENTES: {
  tipo: TipoResultado;
  permiso: string;
  buscar: (busqueda: Busqueda) => Promise<ResultadoGeneralDTO[]>;
}[] = [
  { tipo: 'pedido', permiso: 'PEDIDO_LEER', buscar: pedidos },
  { tipo: 'venta', permiso: 'VENTA_LEER', buscar: ventas },
  { tipo: 'orden', permiso: 'ORDEN_PRODUCCION_GESTIONAR', buscar: ordenes },
  { tipo: 'cliente', permiso: 'CLIENTE_GESTIONAR', buscar: clientes },
  { tipo: 'producto', permiso: 'PRODUCTO_GESTIONAR', buscar: productos },
  { tipo: 'insumo', permiso: 'STOCK_CONSULTAR', buscar: insumos },
  { tipo: 'almacen', permiso: 'STOCK_CONSULTAR', buscar: almacenes },
  { tipo: 'usuario', permiso: 'USUARIO_LEER', buscar: usuarios },
];

/**
 * «12» y «#12» son un número; «pollo 12», no.
 *
 * Un número busca pedidos, ventas y órdenes por su identificador, que es como
 * los nombra quien los atiende («el pedido 12»).
 */
function numeroBuscado(termino: string): number | null {
  const encontrado = /^#?(\d{1,9})$/.exec(termino);
  return encontrado ? Number(encontrado[1]) : null;
}

export async function buscar(idUsuario: number, termino: string): Promise<BusquedaGeneralDTO> {
  /*
   * Es una herramienta del personal. El permiso solo no alcanza: el rol
   * Cliente tiene `PEDIDO_LEER` para ver **sus** pedidos, y sin esta
   * comprobación el buscador le mostraría los de todos. Es la misma doble
   * condición —permiso y subtipo— que aplica el tablero de pedidos.
   */
  await exigirEmpleado(idUsuario, 'usar el buscador general');

  const limpio = termino.trim();
  const busqueda: Busqueda = { termino: limpio, numero: numeroBuscado(limpio) };

  // Una sola letra coincide con casi todo: no ayuda a encontrar nada.
  if (busqueda.numero === null && palabrasDe(limpio).join('').length < 2) {
    return { termino: limpio, resultados: [] };
  }

  const permisos = new Set(await permisoModel.permisosDeUsuario(idUsuario));
  const grupos = await Promise.all(
    FUENTES.filter((f) => permisos.has(f.permiso)).map((f) => f.buscar(busqueda)),
  );

  return { termino: limpio, resultados: grupos.flat() };
}

/* ------------------------------------------------------------------ */
/* Cada tipo, de la fila de la base al resultado                        */
/* ------------------------------------------------------------------ */

const nombreDe = (u: { nombre: string; apellido: string }) => `${u.nombre} ${u.apellido}`;

/** Arma un resultado con los campos que no aplican en nulo. */
function resultado(
  campos: Pick<ResultadoGeneralDTO, 'tipo' | 'id' | 'titulo' | 'detalle'> &
    Partial<Pick<ResultadoGeneralDTO, 'estado' | 'monto' | 'fecha' | 'referencia'>>,
): ResultadoGeneralDTO {
  return { estado: null, monto: null, fecha: null, referencia: null, ...campos };
}

async function pedidos({ termino, numero }: Busqueda) {
  const filas = await pedidoModel.coincidencias({ termino, numero }, TOPE);
  return filas.map((p) =>
    resultado({
      tipo: 'pedido',
      id: p.id_pedido,
      titulo: `Pedido #${p.id_pedido}`,
      detalle: nombreDe(p.cliente.usuario),
      estado: p.estado_pedido,
      monto: Number(p.total),
      fecha: p.fecha.toISOString(),
    }),
  );
}

async function ventas({ numero }: Busqueda) {
  if (numero === null) return [];
  const filas = await ventaModel.porNumero(numero);
  return filas.map((v) =>
    resultado({
      tipo: 'venta',
      id: v.id_venta,
      titulo: `Venta #${v.id_venta}`,
      detalle: [
        v.tipo_venta === 'Llevar' ? 'Para llevar' : 'En mesa',
        v.cliente ? nombreDe(v.cliente.usuario) : null,
      ]
        .filter(Boolean)
        .join(' · '),
      estado: v.estado_pago,
      monto: Number(v.total),
      fecha: v.fecha.toISOString(),
    }),
  );
}

async function ordenes({ numero }: Busqueda) {
  if (numero === null) return [];
  const filas = await ordenModel.porNumero(numero);
  return filas.map((o) =>
    resultado({
      tipo: 'orden',
      id: o.id_orden_produccion,
      titulo: `Orden de producción #${o.id_orden_produccion}`,
      detalle: `${o.cantidad} u de ${o.receta.producto.nombre}`,
      estado: o.estado,
      fecha: o.fecha.toISOString(),
    }),
  );
}

async function clientes({ termino }: Busqueda) {
  const filas = await clienteModel.coincidencias(termino, TOPE);
  return filas.map((c) =>
    resultado({
      tipo: 'cliente',
      id: c.id_cliente,
      titulo: nombreDe(c.usuario),
      detalle: c.usuario.activo ? c.usuario.email : `${c.usuario.email} · dado de baja`,
      referencia: c.usuario.email,
    }),
  );
}

async function productos({ termino }: Busqueda) {
  const filas = await productoModel.coincidencias(termino, TOPE);
  return filas.map((p) =>
    resultado({
      tipo: 'producto',
      id: p.id_producto,
      titulo: p.nombre,
      detalle: p.activo ? p.categoria.nombre : `${p.categoria.nombre} · inactivo`,
      monto: Number(p.precio_venta),
    }),
  );
}

async function insumos({ termino }: Busqueda) {
  const filas = await insumoModel.coincidencias(termino, TOPE);
  return filas.map((i) => {
    const existencia = redondearCantidad(
      i.ingrediente_almacen.reduce((suma, e) => suma + Number(e.stock_actual), 0),
    );
    const enStock = `${formatearCantidad(existencia)} ${i.unidad_medida.abreviatura} en existencia`;
    return resultado({
      tipo: 'insumo',
      id: i.id_ingrediente,
      titulo: i.nombre,
      detalle: i.activo ? enStock : `${enStock} · inactivo`,
      referencia: i.nombre,
    });
  });
}

async function almacenes({ termino }: Busqueda) {
  const filas = await almacenModel.coincidencias(termino, TOPE);
  return filas.map((a) =>
    resultado({
      tipo: 'almacen',
      id: a.id_almacen,
      titulo: a.nombre,
      detalle: [a.tipo_conservacion, a.ubicacion_fisica].filter(Boolean).join(' · '),
    }),
  );
}

async function usuarios({ termino }: Busqueda) {
  const filas = await usuarioModel.coincidencias(termino, TOPE);
  return filas.map((u) =>
    resultado({
      tipo: 'usuario',
      id: u.id_usuario,
      titulo: nombreDe(u),
      detalle: [
        `@${u.nombre_usuario}`,
        u.rol.nombre,
        !u.activo ? 'de baja' : u.bloqueado ? 'bloqueado' : null,
      ]
        .filter(Boolean)
        .join(' · '),
      referencia: u.nombre_usuario,
    }),
  );
}
