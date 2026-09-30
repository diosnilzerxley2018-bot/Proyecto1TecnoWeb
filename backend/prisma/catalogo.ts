// En Railway las variables las pone la plataforma; en el VPS y en desarrollo
// vienen del `.env`, igual que en `seed.ts`.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/config/prisma.js';
import * as insumoService from '../src/services/insumo.service.js';
import * as productoService from '../src/services/producto.service.js';
import * as recetaService from '../src/services/receta.service.js';
import * as ingresoService from '../src/services/ingreso.service.js';
import * as egresoService from '../src/services/egreso.service.js';
import * as ordenService from '../src/services/orden-produccion.service.js';
import { esquemaCrearInsumo, esquemaFiltroInsumos } from '../src/dtos/insumo.dto.js';
import { esquemaCrearProducto, esquemaFiltroProductos } from '../src/dtos/producto.dto.js';
import { esquemaCrearReceta } from '../src/dtos/receta.dto.js';
import { esquemaCrearEgreso, esquemaCrearIngreso } from '../src/dtos/movimiento.dto.js';
import { redondearCantidad } from '../src/utils/cantidad.js';
import { normalizar } from '../src/utils/texto.js';

/**
 * Catálogo de demostración de un solo local, con existencias creíbles.
 *
 * Agrega bebidas, ensaladas y platos con sus recetas y sus fotos, les da
 * receta a los productos del seed que no la tenían, y deja las existencias en
 * cantidades de un local —20 L de aceite, 30 kg de harina, ocho ensaladas—
 * en lugar de los miles que dejaron las pruebas.
 *
 * **No escribe en las tablas: usa los servicios del sistema**, como si alguien
 * lo cargara desde la pantalla. Lo que falta se compra (nota de ingreso por
 * Compra, a precio de mercado y con proveedor), los platos se elaboran con
 * órdenes de producción, las bebidas envasadas se compran hechas, y lo que
 * sobra se descuenta con una nota de egreso por Ajuste. Así cada cifra queda
 * respaldada por su nota, el costo sale de lo pagado y los perecederos tienen
 * lote y vencimiento.
 *
 * Es idempotente: crea solo lo que falta y lleva cada existencia a su meta, así
 * que una segunda corrida no cambia nada. Las fotos son de dominio público
 * (CC0), ver `catalogo/CREDITOS.md`; no pisa una foto que ya exista.
 *
 * Uso:  npm run db:catalogo
 */

const IMAGENES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'catalogo', 'imagenes');

type Conservacion = 'Seco' | 'Refrigerado';

interface InsumoCatalogo {
  nombre: string;
  unidad: 'Kilogramo' | 'Litro' | 'Unidad';
  conservacion: Conservacion;
  /** Días que dura: si lo tiene, es perecedero y entra con lote y vencimiento. */
  dura?: number;
  /** Lo que se paga, por unidad. */
  precio: number;
  proveedor: string;
  /** Lo que tiene que quedar en el local. */
  meta: number;
  stockMinimo: number;
}

/** Los insumos nuevos y las metas de los que ya existían (sin precio: ya tienen costo). */
const INSUMOS: InsumoCatalogo[] = [
  // Verduras, frutas y hierbas del mercado
  { nombre: 'Espinaca', unidad: 'Kilogramo', conservacion: 'Refrigerado', dura: 5, precio: 12, proveedor: 'Mercado Central Montero', meta: 3, stockMinimo: 1 },
  { nombre: 'Pepino', unidad: 'Kilogramo', conservacion: 'Refrigerado', dura: 7, precio: 6, proveedor: 'Mercado Central Montero', meta: 4, stockMinimo: 1 },
  { nombre: 'Palta', unidad: 'Kilogramo', conservacion: 'Refrigerado', dura: 6, precio: 18, proveedor: 'Mercado Central Montero', meta: 4, stockMinimo: 1 },
  { nombre: 'Frutilla', unidad: 'Kilogramo', conservacion: 'Refrigerado', dura: 4, precio: 20, proveedor: 'Mercado Central Montero', meta: 3, stockMinimo: 1 },
  { nombre: 'Brócoli', unidad: 'Kilogramo', conservacion: 'Refrigerado', dura: 7, precio: 14, proveedor: 'Mercado Central Montero', meta: 4, stockMinimo: 1 },
  { nombre: 'Albahaca', unidad: 'Kilogramo', conservacion: 'Refrigerado', dura: 4, precio: 40, proveedor: 'Mercado Central Montero', meta: 0.3, stockMinimo: 0.1 },
  { nombre: 'Zanahoria', unidad: 'Kilogramo', conservacion: 'Refrigerado', precio: 5, proveedor: 'Mercado Central Montero', meta: 5, stockMinimo: 2 },
  { nombre: 'Naranja', unidad: 'Kilogramo', conservacion: 'Seco', precio: 6, proveedor: 'Mercado Central Montero', meta: 12, stockMinimo: 4 },
  { nombre: 'Papa', unidad: 'Kilogramo', conservacion: 'Seco', precio: 4, proveedor: 'Mercado Central Montero', meta: 15, stockMinimo: 5 },
  // Lácteos y huevos
  { nombre: 'Queso fresco', unidad: 'Kilogramo', conservacion: 'Refrigerado', dura: 12, precio: 38, proveedor: 'Lácteos del Norte', meta: 3, stockMinimo: 1 },
  { nombre: 'Leche descremada', unidad: 'Litro', conservacion: 'Refrigerado', dura: 8, precio: 8, proveedor: 'Lácteos del Norte', meta: 10, stockMinimo: 3 },
  { nombre: 'Huevo', unidad: 'Unidad', conservacion: 'Refrigerado', dura: 20, precio: 1, proveedor: 'Lácteos del Norte', meta: 60, stockMinimo: 24 },
  // Pescado
  { nombre: 'Trucha', unidad: 'Kilogramo', conservacion: 'Refrigerado', dura: 3, precio: 45, proveedor: 'Pescadería del Lago', meta: 4, stockMinimo: 1 },
  // Almacén seco
  { nombre: 'Arroz integral', unidad: 'Kilogramo', conservacion: 'Seco', precio: 12, proveedor: 'Distribuidora Sur', meta: 10, stockMinimo: 3 },
  { nombre: 'Miel de abeja', unidad: 'Kilogramo', conservacion: 'Seco', precio: 45, proveedor: 'Distribuidora Sur', meta: 2, stockMinimo: 0.5 },
  { nombre: 'Tortilla integral', unidad: 'Unidad', conservacion: 'Seco', precio: 2, proveedor: 'Distribuidora Sur', meta: 30, stockMinimo: 10 },
  // Las galletas la llevan; en el VPS ya existía, cargada a mano.
  { nombre: 'Uva pasa', unidad: 'Kilogramo', conservacion: 'Seco', precio: 18, proveedor: 'Distribuidora Sur', meta: 3, stockMinimo: 1 },
];

/** Cuánto tiene que quedar de los insumos que ya estaban (el seed y los que se cargaron a mano). */
const METAS_EXISTENTES: Record<string, number> = {
  'Pechuga de pollo': 12,
  'Lechuga romana': 5,
  Tomate: 8,
  Limon: 4,
  'Yogur griego natural': 6,
  'Quinua real': 10,
  'Aceite de oliva': 20,
  'Avena en hojuelas': 15,
  Almendras: 4,
  'Harina integral': 30,
  'azucar morena': 10,
  'yogurt griego': 24,
};

/** Si un insumo que ya existía no alcanza, se compra a su costo actual con este proveedor. */
const PROVEEDOR_DE_REPOSICION = 'Distribuidora Sur';

type Receta = [insumo: string, cantidad: number][];

interface ProductoCatalogo {
  nombre: string;
  categoria: string;
  precio: number;
  conservacion: Conservacion;
  descripcion: string;
  imagen: string;
  meta: number;
  /** Lo que lleva una porción. Sin receta, se compra hecho. */
  receta?: Receta;
  /** Si se compra hecho: a cuánto y a quién. */
  compra?: { precio: number; proveedor: string };
}

const PRODUCTOS: ProductoCatalogo[] = [
  // --- Bebidas ---
  {
    nombre: 'Batido de frutilla y avena', categoria: 'Bebidas naturales', precio: 16, conservacion: 'Refrigerado',
    descripcion: 'Frutilla fresca, leche descremada, avena y un toque de miel', imagen: 'batido-de-frutilla-y-avena', meta: 10,
    receta: [['Frutilla', 0.12], ['Leche descremada', 0.25], ['Avena en hojuelas', 0.03], ['Miel de abeja', 0.01]],
  },
  {
    nombre: 'Jugo de naranja natural', categoria: 'Bebidas naturales', precio: 12, conservacion: 'Refrigerado',
    descripcion: 'Naranja exprimida al momento, sin azúcar', imagen: 'jugo-de-naranja-natural', meta: 12,
    receta: [['Naranja', 0.5]],
  },
  {
    nombre: 'Yogur bebible de frutilla', categoria: 'Bebidas naturales', precio: 10, conservacion: 'Refrigerado',
    descripcion: 'Botella de 330 ml', imagen: 'yogur-bebible-de-frutilla', meta: 24,
    compra: { precio: 6, proveedor: 'Lácteos del Norte' },
  },
  {
    nombre: 'Agua mineral con gas', categoria: 'Bebidas naturales', precio: 8, conservacion: 'Seco',
    descripcion: 'Botella de 500 ml', imagen: 'agua-mineral-con-gas', meta: 24,
    compra: { precio: 4, proveedor: 'Distribuidora Sur' },
  },
  // --- Ensaladas ---
  {
    nombre: 'Ensalada de quinua y palta', categoria: 'Ensaladas', precio: 35, conservacion: 'Refrigerado',
    descripcion: 'Quinua real, palta, tomate y limón', imagen: 'ensalada-de-quinua-y-palta', meta: 8,
    receta: [['Quinua real', 0.08], ['Palta', 0.08], ['Tomate', 0.06], ['Limon', 0.02], ['Aceite de oliva', 0.01]],
  },
  {
    nombre: 'Ensalada caprese', categoria: 'Ensaladas', precio: 30, conservacion: 'Refrigerado',
    descripcion: 'Tomate, queso fresco y albahaca con aceite de oliva', imagen: 'ensalada-caprese', meta: 8,
    receta: [['Tomate', 0.15], ['Queso fresco', 0.08], ['Albahaca', 0.005], ['Aceite de oliva', 0.012]],
  },
  {
    nombre: 'Ensalada de espinaca con huevo', categoria: 'Ensaladas', precio: 28, conservacion: 'Refrigerado',
    descripcion: 'Espinaca, huevo duro, queso fresco y tomate', imagen: 'ensalada-de-espinaca-con-huevo', meta: 8,
    receta: [['Espinaca', 0.08], ['Huevo', 1], ['Queso fresco', 0.03], ['Tomate', 0.04], ['Aceite de oliva', 0.01]],
  },
  // --- Platos ---
  {
    nombre: 'Trucha a la plancha con verduras', categoria: 'Platos principales', precio: 55, conservacion: 'Refrigerado',
    descripcion: 'Trucha a la plancha con brócoli y zanahoria al vapor', imagen: 'trucha-a-la-plancha-con-verduras', meta: 6,
    receta: [['Trucha', 0.25], ['Brócoli', 0.1], ['Zanahoria', 0.08], ['Limon', 0.02], ['Aceite de oliva', 0.01]],
  },
  {
    nombre: 'Arroz integral con pollo y brócoli', categoria: 'Platos principales', precio: 40, conservacion: 'Refrigerado',
    descripcion: 'Arroz integral, pechuga de pollo, brócoli y zanahoria', imagen: 'arroz-integral-con-pollo-y-brocoli', meta: 8,
    receta: [['Arroz integral', 0.1], ['Pechuga de pollo', 0.15], ['Brócoli', 0.1], ['Zanahoria', 0.05], ['Aceite de oliva', 0.01]],
  },
  {
    nombre: 'Tortilla de espinaca', categoria: 'Platos principales', precio: 28, conservacion: 'Refrigerado',
    descripcion: 'Tres huevos, espinaca y queso fresco', imagen: 'tortilla-de-espinaca', meta: 8,
    receta: [['Huevo', 3], ['Espinaca', 0.06], ['Queso fresco', 0.04], ['Aceite de oliva', 0.008]],
  },
  // --- Los del seed: foto, la receta que les faltaba y una existencia de un día ---
  {
    nombre: 'Ensalada Cesar con pollo', categoria: 'Ensaladas', precio: 35, conservacion: 'Seco',
    descripcion: '', imagen: 'ensalada-cesar-con-pollo', meta: 8,
  },
  {
    nombre: 'Ensalada mediterranea', categoria: 'Ensaladas', precio: 32, conservacion: 'Seco',
    descripcion: '', imagen: 'ensalada-mediterranea', meta: 8,
    receta: [['Lechuga romana', 0.1], ['Tomate', 0.1], ['Pepino', 0.08], ['Queso fresco', 0.05], ['Aceite de oliva', 0.015]],
  },
  {
    nombre: 'Bowl de quinua y verduras', categoria: 'Platos principales', precio: 42, conservacion: 'Seco',
    descripcion: '', imagen: 'bowl-de-quinua-y-verduras', meta: 8,
  },
  {
    nombre: 'Pechuga a la plancha con pure', categoria: 'Platos principales', precio: 45, conservacion: 'Seco',
    descripcion: '', imagen: 'pechuga-a-la-plancha-con-pure', meta: 8,
    receta: [['Pechuga de pollo', 0.2], ['Papa', 0.25], ['Leche descremada', 0.05], ['Aceite de oliva', 0.01]],
  },
  {
    nombre: 'Wrap integral de pollo', categoria: 'Platos principales', precio: 38, conservacion: 'Seco',
    descripcion: '', imagen: 'wrap-integral-de-pollo', meta: 10,
    receta: [['Tortilla integral', 1], ['Pechuga de pollo', 0.12], ['Lechuga romana', 0.04], ['Tomate', 0.05], ['Palta', 0.04]],
  },
  {
    nombre: 'Jugo verde detox', categoria: 'Bebidas naturales', precio: 18, conservacion: 'Seco',
    descripcion: '', imagen: 'jugo-verde-detox', meta: 10,
    receta: [['Espinaca', 0.05], ['Pepino', 0.12], ['Limon', 0.04], ['Miel de abeja', 0.01]],
  },
  {
    nombre: 'Limonada con hierbabuena', categoria: 'Bebidas naturales', precio: 15, conservacion: 'Seco',
    descripcion: '', imagen: 'limonada-con-hierbabuena', meta: 12,
  },
  {
    nombre: 'Mousse de maracuya light', categoria: 'Postres saludables', precio: 16, conservacion: 'Seco',
    descripcion: '', imagen: 'mousse-de-maracuya-light', meta: 10,
  },
  {
    nombre: 'Barra de avena y almendras', categoria: 'Postres saludables', precio: 12, conservacion: 'Seco',
    descripcion: '', imagen: 'barra-de-avena-y-almendras', meta: 20,
  },
  {
    nombre: 'Galletas de avena sin azucar', categoria: 'Postres saludables', precio: 10, conservacion: 'Seco',
    descripcion: '', imagen: 'galletas-de-avena-sin-azucar', meta: 20,
    receta: [['Avena en hojuelas', 0.08], ['Harina integral', 0.03], ['uva pasa', 0.025], ['Aceite de oliva', 0.01]],
  },
  {
    nombre: 'agua natural', categoria: 'Bebidas naturales', precio: 7, conservacion: 'Seco',
    descripcion: '', imagen: 'agua-natural', meta: 24,
    compra: { precio: 4, proveedor: 'Distribuidora Sur' },
  },
];

const OBSERVACION_AJUSTE = 'Ajuste de inventario: cantidades de un solo local';

/* ------------------------------------------------------------------ */

const clave = (nombre: string) => normalizar(nombre).trim();

function diaEn(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let numeroDeLote = 0;
const loteNuevo = (nombre: string) =>
  `L-${normalizar(nombre).replace(/[^a-z]/g, '').slice(0, 4).toUpperCase()}-${diaEn(0).replace(/-/g, '').slice(2)}${++numeroDeLote}`;

async function main(): Promise<void> {
  // Quien registra: un administrador que sea empleado, como en la pantalla.
  const admin = await prisma.usuario.findFirst({
    where: { activo: true, rol: { nombre: 'Administrador' }, empleado: { isNot: null } },
    orderBy: { id_usuario: 'asc' },
    select: { id_usuario: true, nombre_usuario: true },
  });
  if (!admin) throw new Error('No hay un administrador empleado activo que firme las notas');
  const yo = admin.id_usuario;
  console.log(`Registra: ${admin.nombre_usuario}`);

  const almacenes = await prisma.almacen.findMany({ orderBy: { id_almacen: 'asc' } });
  const almacenPara = (c: Conservacion) => {
    const aptos = almacenes.filter((a) => a.tipo_conservacion === c);
    const elegido = aptos.find((a) => a.preferido) ?? aptos[0];
    if (!elegido) throw new Error(`No hay almacén ${c}`);
    return elegido.id_almacen;
  };

  /* 1. Insumos que faltan ------------------------------------------ */
  const unidades = new Map((await insumoService.listarUnidades()).map((u) => [u.nombre, u.id]));
  const leerInsumos = async () =>
    new Map(
      (await insumoService.listar(esquemaFiltroInsumos.parse({ incluirInactivos: 'true' }))).map((i) => [
        clave(i.nombre),
        i,
      ]),
    );
  let insumos = await leerInsumos();
  for (const i of INSUMOS) {
    if (insumos.has(clave(i.nombre))) continue;
    await insumoService.crear(
      esquemaCrearInsumo.parse({
        nombre: i.nombre,
        idUnidad: unidades.get(i.unidad),
        stockMinimo: i.stockMinimo,
        tipoConservacion: i.conservacion,
        controlaVencimiento: i.dura !== undefined,
      }),
    );
    console.log(`  insumo nuevo: ${i.nombre}`);
  }
  insumos = await leerInsumos();
  const insumo = (nombre: string) => {
    const encontrado = insumos.get(clave(nombre));
    if (!encontrado) throw new Error(`Falta el insumo «${nombre}»`);
    return encontrado;
  };

  /* 2. Productos, fotos y recetas ----------------------------------- */
  const categorias = new Map(
    (await prisma.categoria.findMany()).map((c) => [clave(c.nombre), c.id_categoria]),
  );
  const leerProductos = async () =>
    new Map(
      (await productoService.listar(esquemaFiltroProductos.parse({ incluirInactivos: 'true' }))).map(
        (p) => [clave(p.nombre), p],
      ),
    );
  let productos = await leerProductos();
  for (const p of PRODUCTOS) {
    let actual = productos.get(clave(p.nombre));
    if (!actual) {
      const idCategoria = categorias.get(clave(p.categoria));
      if (!idCategoria) throw new Error(`Falta la categoría «${p.categoria}»`);
      actual = await productoService.crear(
        esquemaCrearProducto.parse({
          nombre: p.nombre,
          descripcion: p.descripcion || null,
          precioVenta: p.precio,
          idCategoria,
          tipoConservacion: p.conservacion,
        }),
      );
      console.log(`  producto nuevo: ${p.nombre}`);
    }
    if (p.imagen && actual.imagenActualizadaEn === null) {
      await productoService.guardarImagen(actual.id, readFileSync(path.join(IMAGENES, `${p.imagen}.jpg`)));
      console.log(`  foto: ${p.nombre}`);
    }
    if (p.receta) {
      const recetas = await recetaService.listarDeProducto(actual.id);
      if (!recetas.some((r) => r.activa)) {
        await recetaService.crear(
          actual.id,
          esquemaCrearReceta.parse({
            nombre: `${p.nombre} (porción)`,
            rendimiento: 1,
            tiempoPreparacionMinutos: 15,
            activa: true,
            insumos: p.receta.map(([nombre, cantidad]) => ({
              idIngrediente: insumo(nombre).id,
              cantidadRequerida: cantidad,
            })),
          }),
        );
        console.log(`  receta: ${p.nombre}`);
      }
    }
  }
  productos = await leerProductos();
  const producto = (nombre: string) => productos.get(clave(nombre))!;

  /* 3. Lo que hay que elaborar, y lo que eso consume --------------- */
  const aProducir: { nombre: string; idReceta: number; cantidad: number }[] = [];
  const consumo = new Map<number, number>();
  for (const p of PRODUCTOS.filter((x) => !x.compra)) {
    const actual = producto(p.nombre);
    const faltan = p.meta - actual.stockTotal;
    if (faltan <= 0) continue;
    const receta = (await recetaService.listarDeProducto(actual.id)).find((r) => r.activa);
    if (!receta) continue;
    const cantidad = ordenService.cantidadAProducir(receta, faltan);
    aProducir.push({ nombre: p.nombre, idReceta: receta.id, cantidad });
    for (const l of receta.insumos) {
      const usado = (l.cantidadRequerida * cantidad) / receta.rendimiento;
      consumo.set(l.idIngrediente, redondearCantidad((consumo.get(l.idIngrediente) ?? 0) + usado));
    }
  }

  /* 4. Compras: lo que falta para producir y quedar en la meta ------ */
  const metaDe = (i: { nombre: string }) =>
    INSUMOS.find((x) => clave(x.nombre) === clave(i.nombre))?.meta ??
    METAS_EXISTENTES[Object.keys(METAS_EXISTENTES).find((k) => clave(k) === clave(i.nombre)) ?? ''];

  const compras = new Map<string, { insumos: unknown[]; productos: unknown[] }>();
  const anotar = (proveedor: string) => {
    if (!compras.has(proveedor)) compras.set(proveedor, { insumos: [], productos: [] });
    return compras.get(proveedor)!;
  };
  for (const i of insumos.values()) {
    const meta = metaDe(i);
    if (meta === undefined || !i.activo) continue;
    const faltan = redondearCantidad(meta + (consumo.get(i.id) ?? 0) - i.stockTotal);
    if (faltan <= 0) continue;
    const datos = INSUMOS.find((x) => clave(x.nombre) === clave(i.nombre));
    anotar(datos?.proveedor ?? PROVEEDOR_DE_REPOSICION).insumos.push({
      idIngrediente: i.id,
      idAlmacen: almacenPara(i.tipoConservacion),
      cantidad: i.unidad.abreviatura === 'u' ? Math.ceil(faltan) : faltan,
      costoUnitario: datos?.precio ?? i.costoUnitario,
      ...(i.controlaVencimiento
        ? { codigoLote: loteNuevo(i.nombre), fechaVencimiento: diaEn(datos?.dura ?? 7) }
        : {}),
    });
  }
  // Las bebidas envasadas se compran hechas.
  for (const p of PRODUCTOS.filter((x) => x.compra)) {
    const actual = producto(p.nombre);
    const faltan = p.meta - actual.stockTotal;
    if (faltan <= 0) continue;
    anotar(p.compra!.proveedor).productos.push({
      idProducto: actual.id,
      idAlmacen: almacenPara(actual.tipoConservacion),
      cantidad: faltan,
      costoUnitario: p.compra!.precio,
    });
  }
  let factura = 3100;
  for (const [proveedor, lineas] of compras) {
    await ingresoService.crear(
      yo,
      esquemaCrearIngreso.parse({
        motivo: 'Compra',
        proveedor,
        numeroDocumento: `F-${++factura}`,
        ...lineas,
      }),
    );
    console.log(`  compra a ${proveedor}: ${lineas.insumos.length + lineas.productos.length} línea(s)`);
  }

  /* 5. Producción ------------------------------------------------------ */
  for (const orden of aProducir) {
    const creada = await ordenService.crear(yo, { idReceta: orden.idReceta, cantidad: orden.cantidad });
    await ordenService.iniciar(yo, creada.id);
    const destino = almacenPara(producto(orden.nombre).tipoConservacion);
    await ordenService.finalizar(yo, creada.id, { idAlmacenDestino: destino });
    console.log(`  producción: ${orden.cantidad} × ${orden.nombre}`);
  }

  /* 6. Ajuste: lo que sobra, hasta la meta ------------------------- */
  insumos = await leerInsumos();
  productos = await leerProductos();
  const sobra = (existencias: { idAlmacen: number; stock: number }[], exceso: number) => {
    const lineas: { idAlmacen: number; cantidad: number }[] = [];
    let resta = exceso;
    for (const e of [...existencias].sort((a, b) => b.stock - a.stock)) {
      if (resta <= 0) break;
      const cantidad = redondearCantidad(Math.min(resta, e.stock));
      if (cantidad > 0) lineas.push({ idAlmacen: e.idAlmacen, cantidad });
      resta = redondearCantidad(resta - cantidad);
    }
    return lineas;
  };
  const ajusteInsumos = [...insumos.values()].flatMap((i) => {
    const meta = metaDe(i);
    if (meta === undefined || !i.activo || i.stockTotal <= meta) return [];
    return sobra(i.existencias, redondearCantidad(i.stockTotal - meta)).map((l) => ({
      idIngrediente: i.id,
      ...l,
    }));
  });
  const ajusteProductos = PRODUCTOS.flatMap((p) => {
    const actual = producto(p.nombre);
    if (actual.stockTotal <= p.meta) return [];
    return sobra(actual.existencias, actual.stockTotal - p.meta).map((l) => ({
      idProducto: actual.id,
      ...l,
    }));
  });
  if (ajusteInsumos.length + ajusteProductos.length > 0) {
    await egresoService.crear(
      yo,
      esquemaCrearEgreso.parse({
        motivo: 'Ajuste',
        observacion: OBSERVACION_AJUSTE,
        insumos: ajusteInsumos,
        productos: ajusteProductos,
      }),
    );
    console.log(`  ajuste: ${ajusteInsumos.length + ajusteProductos.length} línea(s) bajadas a su meta`);
  }

  console.log('Listo: catálogo y existencias de un solo local.');
}

main()
  .catch((error: unknown) => {
    console.error('No se pudo cargar el catálogo:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
