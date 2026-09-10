import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Catálogo de permisos del sistema, por subsistema. */
const PERMISOS = [
  // Administración y Seguridad
  'USUARIO_LEER', 'USUARIO_CREAR', 'USUARIO_EDITAR', 'USUARIO_BAJA',
  'ROL_LEER', 'ROL_GESTIONAR', 'PERMISO_ASIGNAR', 'CONFIGURACION_GESTIONAR',
  // Ventas
  'VENTA_REGISTRAR', 'VENTA_LEER', 'CLIENTE_GESTIONAR',
  // Pedidos
  'PEDIDO_GESTIONAR', 'PEDIDO_LEER',
  // Producción
  'PRODUCTO_GESTIONAR', 'ORDEN_PRODUCCION_GESTIONAR',
  // Inventario
  'INSUMO_GESTIONAR', 'ALMACEN_GESTIONAR', 'INGRESO_REGISTRAR',
  'EGRESO_REGISTRAR', 'STOCK_CONSULTAR',
];

/** Permisos que corresponden a cada rol. */
const PERMISOS_POR_ROL: Record<string, string[]> = {
  Administrador: PERMISOS,
  Empleado: [
    'VENTA_REGISTRAR', 'VENTA_LEER', 'CLIENTE_GESTIONAR',
    'PEDIDO_GESTIONAR', 'PEDIDO_LEER',
    'PRODUCTO_GESTIONAR', 'ORDEN_PRODUCCION_GESTIONAR',
    'INSUMO_GESTIONAR', 'INGRESO_REGISTRAR', 'EGRESO_REGISTRAR', 'STOCK_CONSULTAR',
  ],
  Cliente: ['PEDIDO_GESTIONAR', 'PEDIDO_LEER'],
};

/**
 * Parámetros que el administrador puede cambiar sin tocar código.
 *
 * El modo de cobro nace en `Simulado` **a propósito**: un sistema recién
 * instalado no debe poder mover dinero real hasta que alguien lo decida de
 * forma explícita. `update: {}` deja intacto el valor si ya existe, de modo que
 * volver a sembrar no devuelve a modo simulado una instalación en producción.
 */
async function sembrarConfiguracion() {
  await prisma.configuracion.upsert({
    where: { clave: 'MODO_COBRO' },
    update: {},
    create: {
      clave: 'MODO_COBRO',
      valor: 'Simulado',
      descripcion: 'Simulado = no se mueve dinero real. Real = se cobra con la pasarela configurada.',
    },
  });
}

async function main() {
  console.log('Cargando datos iniciales...');

  // 1. Permisos
  for (const nombre of PERMISOS) {
    await prisma.permiso.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }

  await sembrarConfiguracion();
  const permisos = await prisma.permiso.findMany();
  const idPermiso = new Map(permisos.map((p) => [p.nombre, p.id_permiso]));

  // 2. Roles y sus permisos
  for (const [nombreRol, nombresPermiso] of Object.entries(PERMISOS_POR_ROL)) {
    const rol = await prisma.rol.upsert({
      where: { nombre: nombreRol }, update: {}, create: { nombre: nombreRol },
    });
    for (const np of nombresPermiso) {
      const idP = idPermiso.get(np)!;
      const existe = await prisma.rol_permiso.findFirst({
        where: { id_rol: rol.id_rol, id_permiso: idP },
      });
      if (!existe) {
        await prisma.rol_permiso.create({ data: { id_rol: rol.id_rol, id_permiso: idP } });
      }
    }
  }

  // 3. Cargos
  for (const nombre of ['Administrador', 'Vendedor', 'Cocinero', 'Almacenero', 'Repartidor']) {
    await prisma.cargo.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }

  // 4. Usuario administrador inicial
  const rolAdmin = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'Administrador' } });
  const cargoAdmin = await prisma.cargo.findUniqueOrThrow({ where: { nombre: 'Administrador' } });

  const admin = await prisma.usuario.upsert({
    where: { nombre_usuario: 'admin' },
    update: {},
    create: {
      nombre: 'Nilser Rodrigo',
      apellido: 'Condori Ortiz',
      email: 'admin@nutriexpress.bo',
      nombre_usuario: 'admin',
      contrasena_hash: await bcrypt.hash('Admin1234!', 10),
      id_rol: rolAdmin.id_rol,
    },
  });

  await prisma.empleado.upsert({
    where: { id_empleado: admin.id_usuario },
    update: {},
    create: { id_empleado: admin.id_usuario, id_cargo: cargoAdmin.id_cargo },
  });

  // 5. Habilitar al admin todos los permisos de su rol (CU-SEG-04)
  const rpAdmin = await prisma.rol_permiso.findMany({ where: { id_rol: rolAdmin.id_rol } });
  for (const rp of rpAdmin) {
    const existe = await prisma.usuario_rol_permiso.findFirst({
      where: { id_usuario: admin.id_usuario, id_rol_permiso: rp.id_rol_permiso },
    });
    if (!existe) {
      await prisma.usuario_rol_permiso.create({
        data: { id_usuario: admin.id_usuario, id_rol_permiso: rp.id_rol_permiso },
      });
    }
  }


  // 6. Reparar usuarios sin fila de subtipo.
  //    El modelo de clases define Usuario como supertipo de Empleado y Cliente.
  //    Un usuario sin su fila de subtipo no puede participar en ventas, pedidos
  //    ni notas de inventario, porque esas tablas referencian a `empleado` o `cliente`.
  const cargoPorDefecto = await prisma.cargo.findUniqueOrThrow({ where: { nombre: 'Vendedor' } });
  const huerfanos = await prisma.usuario.findMany({
    where: { empleado: { is: null }, cliente: { is: null } },
    include: { rol: true },
  });

  for (const u of huerfanos) {
    if (u.rol.nombre === 'Cliente') {
      await prisma.cliente.create({ data: { id_cliente: u.id_usuario } });
    } else {
      await prisma.empleado.create({
        data: { id_empleado: u.id_usuario, id_cargo: cargoPorDefecto.id_cargo },
      });
    }
    console.log(`  reparado: ${u.nombre_usuario} -> subtipo creado`);
  }

  // 7. Catálogo de demostración (productos con stock para el portal de pedidos).
  await cargarCatalogo();

  // 8. Repartidor de demostración: RF-PED-07 solo admite este cargo, de modo
  //    que sin al menos uno el flujo de pedidos no puede completarse.
  await cargarRepartidor();

  // 9. Unidades de medida e insumos: CU-INV-01 exige que existan unidades
  //    registradas antes de poder dar de alta un insumo.
  await cargarInsumos();

  // 10. Recetas activas: CU-PRO-02 genera órdenes de producción a partir de
  //     ellas, de modo que sin recetas ese flujo no puede ejercitarse.
  await cargarRecetas();

  console.log(`  permisos: ${PERMISOS.length}`);
  console.log(`  roles:    ${Object.keys(PERMISOS_POR_ROL).length}`);
  console.log(`  usuario:  admin / Admin1234!`);
  console.log(`  catalogo: ${CATALOGO.length} productos con stock`);
  console.log(`  reparto:  repartidor / Reparto1234!`);
  console.log(`  insumos:  ${INSUMOS.length} con unidades y stock`);
  console.log(`  recetas:  ${RECETAS.length} activas`);
}

/**
 * Catálogo de demostración (subsistemas de Producción e Inventario).
 *
 * Gestionar Pedido (CU-PED-02) incluye a Verificar Disponibilidad de Stock
 * (CU-INV-06): sin productos con existencias el portal de pedidos no puede
 * ejercitarse. Estos datos son la línea base para desarrollo y pruebas.
 */
const ALMACENES = [
  { nombre: 'Almacen Seco',       tipo_conservacion: 'Seco',        ubicacion_fisica: 'Planta baja - deposito' },
  { nombre: 'Camara Refrigerada', tipo_conservacion: 'Refrigerado', ubicacion_fisica: 'Planta baja - cocina' },
];

const REFRIGERADO = 'Camara Refrigerada';
const SECO = 'Almacen Seco';

const CATALOGO = [
  { nombre: 'Ensalada Cesar con pollo', categoria: 'Ensaladas', precio: 35,
    descripcion: 'Lechuga romana, pollo a la plancha, crutones integrales y aderezo ligero.',
    almacen: REFRIGERADO, stock: 40,
    nutricion: { calorias: 320, proteinas_g: 28, carbohidratos_g: 12, grasas_g: 18, fibra_g: 3.5 } },
  { nombre: 'Ensalada mediterranea', categoria: 'Ensaladas', precio: 32,
    descripcion: 'Tomate, pepino, aceitunas, queso fresco y aceite de oliva.',
    almacen: REFRIGERADO, stock: 35,
    nutricion: { calorias: 280, proteinas_g: 9, carbohidratos_g: 20, grasas_g: 17, fibra_g: 5.2 } },
  { nombre: 'Bowl de quinua y verduras', categoria: 'Platos principales', precio: 42,
    descripcion: 'Quinua real, verduras salteadas, palta y semillas de girasol.',
    almacen: REFRIGERADO, stock: 30,
    nutricion: { calorias: 450, proteinas_g: 16, carbohidratos_g: 62, grasas_g: 14, fibra_g: 8.1 } },
  { nombre: 'Pechuga a la plancha con pure', categoria: 'Platos principales', precio: 48,
    descripcion: 'Pechuga de pollo, pure de papa nativa y ensalada de estacion.',
    almacen: REFRIGERADO, stock: 25,
    nutricion: { calorias: 520, proteinas_g: 42, carbohidratos_g: 38, grasas_g: 20, fibra_g: 4 } },
  { nombre: 'Wrap integral de pollo', categoria: 'Platos principales', precio: 38,
    descripcion: 'Tortilla integral, pollo desmenuzado, vegetales frescos y yogur natural.',
    almacen: REFRIGERADO, stock: 28,
    nutricion: { calorias: 410, proteinas_g: 30, carbohidratos_g: 40, grasas_g: 13, fibra_g: 6 } },
  { nombre: 'Jugo verde detox', categoria: 'Bebidas naturales', precio: 18,
    descripcion: 'Espinaca, manzana verde, apio y jengibre, sin azucar anadida.',
    almacen: REFRIGERADO, stock: 60,
    nutricion: { calorias: 120, proteinas_g: 2, carbohidratos_g: 26, grasas_g: 0.5, fibra_g: 3.8 } },
  { nombre: 'Limonada con hierbabuena', categoria: 'Bebidas naturales', precio: 15,
    descripcion: 'Limon exprimido, hierbabuena fresca y endulzante natural.',
    almacen: REFRIGERADO, stock: 55,
    nutricion: { calorias: 90, proteinas_g: 0.4, carbohidratos_g: 23, grasas_g: 0.2, fibra_g: 0.6 } },
  { nombre: 'Mousse de maracuya light', categoria: 'Postres saludables', precio: 16,
    descripcion: 'Postre de maracuya con yogur griego, sin azucar anadida.',
    almacen: REFRIGERADO, stock: 20,
    nutricion: { calorias: 150, proteinas_g: 5, carbohidratos_g: 18, grasas_g: 6, fibra_g: 1.2 } },
  { nombre: 'Barra de avena y almendras', categoria: 'Postres saludables', precio: 12,
    descripcion: 'Barra horneada de avena, almendras y miel de abeja.',
    almacen: SECO, stock: 80,
    nutricion: { calorias: 210, proteinas_g: 6, carbohidratos_g: 24, grasas_g: 10, fibra_g: 4.4 } },
  { nombre: 'Galletas de avena sin azucar', categoria: 'Postres saludables', precio: 14,
    descripcion: 'Galletas integrales endulzadas con pasas y canela.',
    almacen: SECO, stock: 70,
    nutricion: { calorias: 180, proteinas_g: 4, carbohidratos_g: 26, grasas_g: 7, fibra_g: 3.1 } },
];

async function cargarCatalogo(): Promise<void> {
  for (const almacen of ALMACENES) {
    await prisma.almacen.upsert({ where: { nombre: almacen.nombre }, update: {}, create: almacen });
  }
  const idAlmacen = new Map(
    (await prisma.almacen.findMany()).map((a) => [a.nombre, a.id_almacen]),
  );

  for (const nombre of new Set(CATALOGO.map((p) => p.categoria))) {
    await prisma.categoria.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }
  const idCategoria = new Map(
    (await prisma.categoria.findMany()).map((c) => [c.nombre, c.id_categoria]),
  );

  for (const item of CATALOGO) {
    const existente = await prisma.producto.findFirst({ where: { nombre: item.nombre } });
    const producto =
      existente ??
      (await prisma.producto.create({
        data: {
          nombre: item.nombre,
          descripcion: item.descripcion,
          precio_venta: item.precio,
          // La condición de conservación es la del almacén donde se guarda.
          tipo_conservacion: item.almacen === REFRIGERADO ? 'Refrigerado' : 'Seco',
          id_categoria: idCategoria.get(item.categoria)!,
        },
      }));

    await prisma.valor_nutricional.upsert({
      where: { id_producto: producto.id_producto },
      update: {},
      create: { id_producto: producto.id_producto, ...item.nutricion },
    });

    await prisma.producto_almacen.upsert({
      where: {
        id_producto_id_almacen: {
          id_producto: producto.id_producto,
          id_almacen: idAlmacen.get(item.almacen)!,
        },
      },
      update: {},
      create: {
        id_producto: producto.id_producto,
        id_almacen: idAlmacen.get(item.almacen)!,
        stock_actual: item.stock,
      },
    });
  }
}

/** Empleado con cargo Repartidor, requerido por RF-PED-07. */
async function cargarRepartidor(): Promise<void> {
  const rolEmpleado = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'Empleado' } });
  const cargoReparto = await prisma.cargo.findUniqueOrThrow({ where: { nombre: 'Repartidor' } });

  const usuario = await prisma.usuario.upsert({
    where: { nombre_usuario: 'repartidor' },
    update: {},
    create: {
      nombre: 'Marcos',
      apellido: 'Vargas',
      email: 'reparto@nutriexpress.bo',
      nombre_usuario: 'repartidor',
      contrasena_hash: await bcrypt.hash('Reparto1234!', 10),
      id_rol: rolEmpleado.id_rol,
    },
  });

  await prisma.empleado.upsert({
    where: { id_empleado: usuario.id_usuario },
    update: {},
    create: { id_empleado: usuario.id_usuario, id_cargo: cargoReparto.id_cargo },
  });

  const permisosDelRol = await prisma.rol_permiso.findMany({ where: { id_rol: rolEmpleado.id_rol } });
  for (const rp of permisosDelRol) {
    const existe = await prisma.usuario_rol_permiso.findFirst({
      where: { id_usuario: usuario.id_usuario, id_rol_permiso: rp.id_rol_permiso },
    });
    if (!existe) {
      await prisma.usuario_rol_permiso.create({
        data: { id_usuario: usuario.id_usuario, id_rol_permiso: rp.id_rol_permiso },
      });
    }
  }
}


/** Unidades en las que se expresan los insumos (precondición de CU-INV-01). */
const UNIDADES = [
  { nombre: 'Kilogramo', abreviatura: 'kg' },
  { nombre: 'Gramo', abreviatura: 'g' },
  { nombre: 'Litro', abreviatura: 'L' },
  { nombre: 'Mililitro', abreviatura: 'ml' },
  { nombre: 'Unidad', abreviatura: 'u' },
];

const INSUMOS = [
  { nombre: 'Pechuga de pollo',      unidad: 'Kilogramo', costo: 32.0, minimo: 5, almacen: REFRIGERADO, stock: 20, perecedero: true },
  { nombre: 'Lechuga romana',        unidad: 'Kilogramo', costo: 12.0, minimo: 3, almacen: REFRIGERADO, stock: 10, perecedero: true },
  { nombre: 'Tomate',                unidad: 'Kilogramo', costo: 8.5,  minimo: 4, almacen: REFRIGERADO, stock: 15, perecedero: true },
  { nombre: 'Limon',                 unidad: 'Kilogramo', costo: 9.0,  minimo: 3, almacen: REFRIGERADO, stock: 12, perecedero: true },
  { nombre: 'Yogur griego natural',  unidad: 'Litro',     costo: 22.0, minimo: 4, almacen: REFRIGERADO, stock: 10, perecedero: true },
  { nombre: 'Quinua real',           unidad: 'Kilogramo', costo: 28.0, minimo: 5, almacen: SECO,        stock: 25 },
  { nombre: 'Aceite de oliva',       unidad: 'Litro',     costo: 45.0, minimo: 2, almacen: SECO,        stock: 8 },
  { nombre: 'Avena en hojuelas',     unidad: 'Kilogramo', costo: 14.0, minimo: 5, almacen: SECO,        stock: 30 },
  { nombre: 'Almendras',             unidad: 'Kilogramo', costo: 65.0, minimo: 2, almacen: SECO,        stock: 6 },
  { nombre: 'Harina integral',       unidad: 'Kilogramo', costo: 11.0, minimo: 6, almacen: SECO,        stock: 40 },
];

async function cargarInsumos(): Promise<void> {
  for (const unidad of UNIDADES) {
    await prisma.unidad_medida.upsert({
      where: { nombre: unidad.nombre },
      update: {},
      create: unidad,
    });
  }
  const idUnidad = new Map(
    (await prisma.unidad_medida.findMany()).map((u) => [u.nombre, u.id_unidad]),
  );
  const idAlmacen = new Map(
    (await prisma.almacen.findMany()).map((a) => [a.nombre, a.id_almacen]),
  );

  for (const item of INSUMOS) {
    const existente = await prisma.ingrediente.findFirst({ where: { nombre: item.nombre } });
    const insumo =
      existente ??
      (await prisma.ingrediente.create({
        data: {
          nombre: item.nombre,
          id_unidad: idUnidad.get(item.unidad)!,
          costo_unitario: item.costo,
          stock_minimo: item.minimo,
          tipo_conservacion: item.almacen === REFRIGERADO ? 'Refrigerado' : 'Seco',
          // Los frescos exigen lote y vencimiento en cada ingreso (hallazgo A6).
          controla_vencimiento: 'perecedero' in item && item.perecedero === true,
        },
      }));

    await prisma.ingrediente_almacen.upsert({
      where: {
        id_ingrediente_id_almacen: {
          id_ingrediente: insumo.id_ingrediente,
          id_almacen: idAlmacen.get(item.almacen)!,
        },
      },
      update: {},
      create: {
        id_ingrediente: insumo.id_ingrediente,
        id_almacen: idAlmacen.get(item.almacen)!,
        stock_actual: item.stock,
      },
    });
  }
}


/**
 * Recetas activas de los productos elaborados.
 *
 * RF-PRO-04 admite varias versiones por producto con una sola activa; el
 * índice parcial `ux_receta_activa` lo garantiza. Aquí se carga una versión
 * activa por producto.
 */
const RECETAS = [
  {
    producto: 'Ensalada Cesar con pollo',
    nombre: 'Cesar con pollo - version base',
    rendimiento: 1,
    minutos: 15,
    instrucciones: 'Lavar y cortar la lechuga. Sellar la pechuga y laminarla. Montar y aderezar.',
    insumos: [
      { nombre: 'Lechuga romana', cantidad: 0.15 },
      { nombre: 'Pechuga de pollo', cantidad: 0.12 },
      { nombre: 'Aceite de oliva', cantidad: 0.02 },
    ],
  },
  {
    producto: 'Bowl de quinua y verduras',
    nombre: 'Bowl de quinua - version base',
    rendimiento: 1,
    minutos: 20,
    instrucciones: 'Cocer la quinua. Saltear las verduras. Servir en bowl y aderezar.',
    insumos: [
      { nombre: 'Quinua real', cantidad: 0.1 },
      { nombre: 'Tomate', cantidad: 0.08 },
      { nombre: 'Aceite de oliva', cantidad: 0.01 },
    ],
  },
  {
    producto: 'Limonada con hierbabuena',
    nombre: 'Limonada - version base',
    rendimiento: 2,
    minutos: 5,
    instrucciones: 'Exprimir los limones, mezclar con agua fria y hierbabuena.',
    insumos: [{ nombre: 'Limon', cantidad: 0.2 }],
  },
  {
    producto: 'Barra de avena y almendras',
    nombre: 'Barra de avena - version base',
    rendimiento: 4,
    minutos: 45,
    instrucciones: 'Mezclar los secos, agregar el ligante, prensar y hornear 25 minutos.',
    insumos: [
      { nombre: 'Avena en hojuelas', cantidad: 0.24 },
      { nombre: 'Almendras', cantidad: 0.08 },
      { nombre: 'Harina integral', cantidad: 0.12 },
    ],
  },
  {
    producto: 'Mousse de maracuya light',
    nombre: 'Mousse de maracuya - version base',
    rendimiento: 2,
    minutos: 25,
    instrucciones: 'Batir el yogur con la pulpa, refrigerar dos horas antes de servir.',
    insumos: [{ nombre: 'Yogur griego natural', cantidad: 0.3 }],
  },
];

async function cargarRecetas(): Promise<void> {
  const idProducto = new Map(
    (await prisma.producto.findMany()).map((p) => [p.nombre, p.id_producto]),
  );
  const idInsumo = new Map(
    (await prisma.ingrediente.findMany()).map((i) => [i.nombre, i.id_ingrediente]),
  );

  for (const item of RECETAS) {
    const producto = idProducto.get(item.producto)!;
    const existente = await prisma.receta.findFirst({ where: { id_producto: producto } });
    if (existente) continue;

    const receta = await prisma.receta.create({
      data: {
        id_producto: producto,
        nombre: item.nombre,
        rendimiento: item.rendimiento,
        tiempo_preparacion_minutos: item.minutos,
        instrucciones: item.instrucciones,
        activa: true,
      },
    });

    await prisma.detalle_receta.createMany({
      data: item.insumos.map((i) => ({
        id_receta: receta.id_receta,
        id_ingrediente: idInsumo.get(i.nombre)!,
        cantidad_requerida: i.cantidad,
      })),
    });
  }
}


main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
