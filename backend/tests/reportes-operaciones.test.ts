import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { crearEmpleado, crearPedido, obtenerToken, registrarCliente } from './ayudantes.js';
import { MensajeroSimulado, reiniciarMensajero } from '../src/correo/index.js';

/**
 * RF-PED-10, RF-PRO-08 y RF-INV-08 — reportes de pedidos, producción e
 * inventario.
 *
 * Los tres comparten camino: los datos en JSON, el mismo reporte en PDF y el
 * mismo PDF por correo. Lo que cambia es qué mide cada uno, y eso es lo que
 * verifica cada bloque.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Hoy en formato ISO local, que es el que espera el filtro. */
function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const rangoDeHoy = { desde: hoy(), hasta: hoy() };

/**
 * El correo dirigido a ese destinatario.
 *
 * No sirve tomar el último del buzón: los avisos al cliente salen en segundo
 * plano y pueden depositarse después del reporte.
 */
const correoPara = (destinatario: string) =>
  MensajeroSimulado.enviados.filter((c) => c.para.includes(destinatario)).at(-1);

const consultar = (ruta: string, token: string, filtros: Record<string, unknown> = {}) =>
  request(app)
    .get(`/api/reportes/${ruta}`)
    .query({ ...rangoDeHoy, ...filtros })
    .set(cabecera(token));

beforeEach(() => reiniciarMensajero());

/* ------------------------------------------------------------------ */
/* RF-PED-10                                                           */
/* ------------------------------------------------------------------ */

describe('Reporte de pedidos', () => {
  it('cuenta los pedidos del período y los agrupa por estado', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    await crearPedido(cliente.token, 'Barra de avena');

    const r = await consultar('pedidos', staff);

    expect(r.status).toBe(200);
    expect(r.body.resumen.cantidadPedidos).toBeGreaterThan(0);
    expect(r.body.resumen.total).toBeGreaterThan(0);
    expect(r.body.porEstado.length).toBeGreaterThan(0);
    expect(r.body.pedidos.length).toBe(r.body.resumen.cantidadPedidos);
  });

  /**
   * El tiempo de entrega no está guardado en ninguna columna: sale de restar
   * la confirmación a la entrega. Si el pedido no llegó todavía, el promedio
   * es nulo y no cero, porque cero significaría "se entregó al instante".
   */
  it('mide el tiempo de entrega solo de los pedidos entregados', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Barra de avena');

    const antes = await consultar('pedidos', staff, { estado: 'Recibido' });
    const pedido = antes.body.pedidos.find((p: { id: number }) => p.id === idPedido);
    expect(pedido.minutosDeEntrega).toBeNull();

    const repartidor = await crearEmpleado('Repartidor');
    await request(app)
      .put(`/api/gestion/pedidos/${idPedido}/repartidor`)
      .set(cabecera(staff))
      .send({ idRepartidor: repartidor.id })
      .expect(200);

    for (const estado of ['En preparacion', 'En camino', 'Entregado']) {
      await request(app)
        .patch(`/api/gestion/pedidos/${idPedido}/estado`)
        .set(cabecera(staff))
        .send({ estado })
        .expect(200);
    }

    const despues = await consultar('pedidos', staff, { estado: 'Entregado' });
    expect(despues.body.resumen.minutosPromedio).not.toBeNull();
    expect(despues.body.resumen.entregados).toBeGreaterThan(0);
  });

  it('filtra por estado', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    await crearPedido(cliente.token, 'Barra de avena');

    const r = await consultar('pedidos', staff, { estado: 'Recibido' });

    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('Recibido');
    expect(
      r.body.pedidos.every((p: { estado: string }) => p.estado === 'Recibido'),
    ).toBe(true);
  });

  it('rechaza un repartidor que no existe', async () => {
    const staff = await obtenerToken();
    const r = await consultar('pedidos', staff, { idRepartidor: 999999 });

    expect(r.status).toBe(404);
    expect(r.body.error).toContain('repartidor');
  });

  it('devuelve el reporte en PDF', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/reportes/pedidos.pdf')
      .query(rangoDeHoy)
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/pdf');
    expect(r.headers['content-disposition']).toContain('pedidos-');
    expect(r.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('lo envía por correo con el PDF adjunto', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .post('/api/reportes/pedidos/enviar')
      .set(cabecera(staff))
      .send({ ...rangoDeHoy, para: 'duenio@nutriexpress.bo' });

    expect(r.status).toBe(200);
    expect(r.body.enviado).toBe(true);

    const correo = correoPara('duenio@nutriexpress.bo');
    expect(correo?.adjuntos?.[0].tipo).toBe('application/pdf');
  });

  /**
   * El destinatario se valida aparte de los filtros, y el resto del cuerpo
   * tiene que sobrevivir: si se recortara, el correo llegaría con un reporte
   * sin filtrar y nadie lo notaría hasta abrirlo.
   */
  it('el correo respeta los filtros que van en el cuerpo', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    await crearPedido(cliente.token, 'Barra de avena');

    // Se compara contra el dato real y no contra un número fijo: otras pruebas
    // de la suite cancelan pedidos el mismo día.
    const total = await consultar('pedidos', staff);
    const cancelados = await consultar('pedidos', staff, { estado: 'Cancelado' });
    expect(cancelados.body.resumen.cantidadPedidos).toBeLessThan(
      total.body.resumen.cantidadPedidos,
    );

    await request(app)
      .post('/api/reportes/pedidos/enviar')
      .set(cabecera(staff))
      .send({ ...rangoDeHoy, estado: 'Cancelado', para: 'duenio@nutriexpress.bo' })
      .expect(200);

    const correo = correoPara('duenio@nutriexpress.bo');
    expect(correo?.texto).toContain(
      `${cancelados.body.resumen.cantidadPedidos} pedido(s)`,
    );
  });

  it('exige un correo válido para enviarlo', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .post('/api/reportes/pedidos/enviar')
      .set(cabecera(staff))
      .send({ ...rangoDeHoy, para: 'esto-no-es-un-correo' });

    expect(r.status).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/* RF-PRO-08                                                           */
/* ------------------------------------------------------------------ */

async function idRecetaDe(token: string, nombreProducto: string) {
  const productos = await request(app)
    .get('/api/productos')
    .query({ termino: nombreProducto })
    .set(cabecera(token));
  const recetas = await request(app)
    .get(`/api/productos/${productos.body[0].id}/recetas`)
    .set(cabecera(token));
  return {
    idProducto: productos.body[0].id as number,
    idReceta: recetas.body.find((r: { activa: boolean }) => r.activa).id as number,
  };
}

/** Una corrida completa: crear, iniciar y finalizar. Solo así es producción. */
async function producir(token: string, idReceta: number, cantidad: number) {
  const orden = await request(app)
    .post('/api/ordenes')
    .set(cabecera(token))
    .send({ idReceta, cantidad });
  if (orden.status !== 201) throw new Error(JSON.stringify(orden.body));

  const inicio = await request(app)
    .post(`/api/ordenes/${orden.body.id}/iniciar`)
    .set(cabecera(token));
  if (inicio.status !== 200) throw new Error(`iniciar: ${JSON.stringify(inicio.body)}`);

  // El cuerpo va vacío pero presente: sin `send`, `req.body` llega indefinido
  // y el esquema del almacén de destino lo rechaza.
  const fin = await request(app)
    .post(`/api/ordenes/${orden.body.id}/finalizar`)
    .set(cabecera(token))
    .send({});
  if (fin.status !== 200) throw new Error(`finalizar: ${JSON.stringify(fin.body)}`);

  return orden.body.id as number;
}

describe('Reporte de producción', () => {
  it('suma las corridas finalizadas y su costo', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await idRecetaDe(staff, 'Barra de avena');
    await producir(staff, idReceta, 4);

    const r = await consultar('produccion', staff);

    expect(r.status).toBe(200);
    expect(r.body.resumen.corridas).toBeGreaterThan(0);
    expect(r.body.resumen.unidades).toBeGreaterThanOrEqual(4);
    expect(r.body.resumen.costoTotal).toBeGreaterThan(0);
    expect(r.body.resumen.costoUnitarioPromedio).toBeGreaterThan(0);
  });

  /**
   * El costo no está guardado en la orden: se recalcula escalando la receta,
   * igual que hace el servicio de producción al descontar los insumos.
   */
  it('detalla los insumos que consumió cada corrida', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await idRecetaDe(staff, 'Barra de avena');
    await producir(staff, idReceta, 4);

    const r = await consultar('produccion', staff);

    expect(r.body.insumosConsumidos.length).toBeGreaterThan(0);
    const avena = r.body.insumosConsumidos.find((i: { insumo: string }) =>
      i.insumo.includes('Avena'),
    );
    expect(avena.cantidad).toBeGreaterThan(0);
    expect(avena.unidad).toBeTruthy();

    // El costo de la corrida es la suma de sus insumos.
    const suma = r.body.insumosConsumidos.reduce(
      (t: number, i: { costo: number }) => t + i.costo,
      0,
    );
    expect(Math.abs(suma - r.body.resumen.costoTotal)).toBeLessThan(0.05);
  });

  /** Una orden cancelada no consumió nada, así que no es producción. */
  it('deja fuera las órdenes que no se finalizaron', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await idRecetaDe(staff, 'Barra de avena');

    const antes = await consultar('produccion', staff);

    const orden = await request(app)
      .post('/api/ordenes')
      .set(cabecera(staff))
      .send({ idReceta, cantidad: 4 });
    await request(app)
      .post(`/api/ordenes/${orden.body.id}/cancelar`)
      .set(cabecera(staff))
      .expect(200);

    const despues = await consultar('produccion', staff);
    expect(despues.body.resumen.corridas).toBe(antes.body.resumen.corridas);
  });

  it('filtra por producto', async () => {
    const staff = await obtenerToken();
    const { idReceta, idProducto } = await idRecetaDe(staff, 'Barra de avena');
    await producir(staff, idReceta, 4);

    const r = await consultar('produccion', staff, { idProducto });

    expect(r.status).toBe(200);
    expect(r.body.producto).toContain('Barra');
    expect(r.body.porProducto.every((p: { producto: string }) => p.producto.includes('Barra'))).toBe(
      true,
    );
  });

  it('devuelve el reporte en PDF y por correo', async () => {
    const staff = await obtenerToken();

    const pdf = await request(app)
      .get('/api/reportes/produccion.pdf')
      .query(rangoDeHoy)
      .set(cabecera(staff));
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

    const correo = await request(app)
      .post('/api/reportes/produccion/enviar')
      .set(cabecera(staff))
      .send({ ...rangoDeHoy, para: 'produccion@nutriexpress.bo' });
    expect(correo.body.enviado).toBe(true);
    expect(correoPara('produccion@nutriexpress.bo')?.adjuntos?.[0].nombre).toContain(
      'produccion-',
    );
  });
});

/* ------------------------------------------------------------------ */
/* RF-INV-08                                                           */
/* ------------------------------------------------------------------ */

async function idAlmacen(token: string, nombre: string) {
  const r = await request(app).get('/api/almacenes').set(cabecera(token));
  return r.body.find((a: { nombre: string }) => a.nombre === nombre).id as number;
}

async function buscarInsumo(token: string, termino: string) {
  const r = await request(app).get('/api/insumos').query({ termino }).set(cabecera(token));
  return r.body[0] as { id: number; nombre: string };
}

describe('Reporte de movimientos de inventario', () => {
  it('registra las entradas con su costo', async () => {
    const staff = await obtenerToken();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await buscarInsumo(staff, 'Quinua');

    const antes = await consultar('inventario', staff);

    await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Compra',
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 10, costoUnitario: 8 }],
      })
      .expect(201);

    const r = await consultar('inventario', staff);

    expect(r.status).toBe(200);
    expect(r.body.resumen.ingresos).toBe(antes.body.resumen.ingresos + 1);
    expect(r.body.resumen.costoIngresado).toBeCloseTo(antes.body.resumen.costoIngresado + 80, 2);
  });

  /**
   * El neto es lo que responde "qué se está yendo": negativo significa que se
   * consumió más de lo que entró en el período.
   */
  it('calcula el neto entre entradas y salidas de cada ítem', async () => {
    const staff = await obtenerToken();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await buscarInsumo(staff, 'Quinua');

    await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Compra',
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 6, costoUnitario: 8 }],
      })
      .expect(201);

    await request(app)
      .post('/api/egresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Merma',
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 2 }],
      })
      .expect(201);

    const r = await consultar('inventario', staff, { idIngrediente: insumo.id });

    const fila = r.body.porItem.find((i: { item: string }) => i.item === insumo.nombre);
    expect(fila.entradas).toBeGreaterThanOrEqual(6);
    expect(fila.salidas).toBeGreaterThanOrEqual(2);
    expect(fila.neto).toBeCloseTo(fila.entradas - fila.salidas, 2);
  });

  /** Una salida no lleva costo propio: el esquema no lo guarda. */
  it('no le inventa costo a los egresos', async () => {
    const staff = await obtenerToken();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await buscarInsumo(staff, 'Quinua');

    await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Compra',
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 4, costoUnitario: 8 }],
      })
      .expect(201);
    await request(app)
      .post('/api/egresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Merma',
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 1 }],
      })
      .expect(201);

    const r = await consultar('inventario', staff);
    const egresos = r.body.movimientos.filter((m: { tipo: string }) => m.tipo === 'Egreso');

    expect(egresos.length).toBeGreaterThan(0);
    expect(egresos.every((m: { costo: number | null }) => m.costo === null)).toBe(true);
  });

  it('ordena los movimientos por fecha', async () => {
    const staff = await obtenerToken();
    const r = await consultar('inventario', staff);

    const fechas = r.body.movimientos.map((m: { fecha: string }) => m.fecha);
    expect([...fechas].sort()).toEqual(fechas);
  });

  it('rechaza un insumo que no existe', async () => {
    const staff = await obtenerToken();
    const r = await consultar('inventario', staff, { idIngrediente: 999999 });

    expect(r.status).toBe(404);
    expect(r.body.error).toContain('insumo');
  });

  it('devuelve el reporte en PDF y por correo', async () => {
    const staff = await obtenerToken();

    const pdf = await request(app)
      .get('/api/reportes/inventario.pdf')
      .query(rangoDeHoy)
      .set(cabecera(staff));
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

    const correo = await request(app)
      .post('/api/reportes/inventario/enviar')
      .set(cabecera(staff))
      .send({ ...rangoDeHoy, para: 'almacen@nutriexpress.bo' });
    expect(correo.body.enviado).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Reglas comunes a los tres                                           */
/* ------------------------------------------------------------------ */

describe('Reglas comunes de los reportes de operaciones', () => {
  const rutas = ['pedidos', 'produccion', 'inventario'];

  it.each(rutas)('%s exige que la fecha inicial no sea posterior a la final', async (ruta) => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get(`/api/reportes/${ruta}`)
      .query({ desde: '2026-09-30', hasta: '2026-09-01' })
      .set(cabecera(staff));

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('posterior');
  });

  it.each(rutas)('%s acota el rango a un año', async (ruta) => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get(`/api/reportes/${ruta}`)
      .query({ desde: '2020-01-01', hasta: '2026-01-01' })
      .set(cabecera(staff));

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('días');
  });

  it.each(rutas)('%s exige haber iniciado sesión', async (ruta) => {
    const r = await request(app).get(`/api/reportes/${ruta}`).query(rangoDeHoy);
    expect(r.status).toBe(401);
  });

  /**
   * El rol Cliente tiene `PEDIDO_LEER` para ver sus propios pedidos. El
   * permiso lo deja pasar por la puerta; el servicio comprueba, además, que
   * quien consulta sea empleado, y ahí se detiene.
   */
  it('un cliente con PEDIDO_LEER no accede al reporte del negocio', async () => {
    const cliente = await registrarCliente();
    const r = await consultar('pedidos', cliente.token);

    expect(r.status).toBe(403);
  });

  /**
   * Los permisos se conceden por **rol**, no por cargo: un cocinero tiene rol
   * Empleado y con él `STOCK_CONSULTAR`, así que sí consulta el inventario.
   * Quien no tiene el permiso del módulo es quien se queda fuera.
   */
  it('un cocinero sí consulta el inventario, porque su rol lo permite', async () => {
    const cocinero = await crearEmpleado('Cocinero');
    const r = await consultar('inventario', cocinero.token);

    expect(r.status).toBe(200);
  });

  it.each(['produccion', 'inventario'])(
    'un cliente no tiene el permiso del módulo para %s',
    async (ruta) => {
      const cliente = await registrarCliente();
      const r = await consultar(ruta, cliente.token);

      expect(r.status).toBe(403);
    },
  );
});
