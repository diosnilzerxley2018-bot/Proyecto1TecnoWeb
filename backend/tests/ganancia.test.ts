import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { obtenerToken, registrarCliente, sufijo } from './ayudantes.js';

/**
 * La ganancia de lo vendido en los reportes de ventas y de pedidos
 * (RF-VEN-07 y RF-PED-10).
 *
 * El ejemplo del negocio: el agua se compra a Bs 4 y se vende a Bs 7, así
 * que tres unidades dejan Bs 21 cobrados y Bs 9 de ganancia. El costo se
 * guarda en cada línea al vender, de modo que una compra posterior más cara
 * no reescribe la ganancia de lo que ya se vendió.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let admin = '';
let almacen = 0;
let categoria = 0;
let agua = 0; // para las ventas
let jugo = 0; // para los pedidos

async function crearProducto(nombre: string, precioVenta: number) {
  const r = await request(app)
    .post('/api/productos')
    .set(cabecera(admin))
    .send({ nombre, precioVenta, idCategoria: categoria, tipoConservacion: 'Seco' })
    .expect(201);
  return r.body.id as number;
}

const comprar = (idProducto: number, cantidad: number, costoUnitario: number) =>
  request(app)
    .post('/api/ingresos')
    .set(cabecera(admin))
    .send({
      motivo: 'Compra',
      productos: [{ idProducto, idAlmacen: almacen, cantidad, costoUnitario }],
    })
    .expect(201);

const vender = (idProducto: number, cantidad: number) =>
  request(app)
    .post('/api/ventas')
    .set(cabecera(admin))
    .send({ tipoVenta: 'Mesa', metodoPago: 'Efectivo', items: [{ idProducto, cantidad }] })
    .expect(201);

const reporteDeVentas = async (idProducto: number) =>
  (
    await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: hoy(), hasta: hoy(), idProducto })
      .set(cabecera(admin))
      .expect(200)
  ).body;

const reporteDePedidos = async (filtro: Record<string, number> = {}) =>
  (
    await request(app)
      .get('/api/reportes/pedidos')
      .query({ desde: hoy(), hasta: hoy(), ...filtro })
      .set(cabecera(admin))
      .expect(200)
  ).body;

beforeAll(async () => {
  admin = await obtenerToken();
  const almacenes = await request(app).get('/api/almacenes').set(cabecera(admin));
  almacen = almacenes.body.find((a: { nombre: string }) => a.nombre === 'Almacen Seco').id;
  categoria = (await request(app).get('/api/catalogo/categorias')).body[0].id;

  const s = sufijo();
  agua = await crearProducto(`Agua ${s}`, 7);
  jugo = await crearProducto(`Jugo ${s}`, 7);
  await comprar(agua, 20, 4);
  await comprar(jugo, 20, 4);
});

describe('Reporte de ventas · ganancia', () => {
  it('tres aguas a Bs 7 que costaron Bs 4 dejan Bs 9 de ganancia', async () => {
    await vender(agua, 3);

    const r = await reporteDeVentas(agua);

    expect(r.resumen).toMatchObject({
      unidades: 3,
      total: 21,
      costo: 12,
      ganancia: 9,
      // 9 de cada 21 bolivianos: el 42,86 %.
      margen: 42.86,
      unidadesSinCosto: 0,
    });
    expect(r.porProducto).toEqual([
      expect.objectContaining({ idProducto: agua, importe: 21, costo: 12, ganancia: 9, margen: 42.86 }),
    ]);
  });

  it('una compra posterior más cara no cambia la ganancia de lo ya vendido', async () => {
    // Ahora el costo promedio del agua es (20 × 4 + 20 × 10) / 40 = Bs 7.
    await comprar(agua, 20, 10);
    expect((await reporteDeVentas(agua)).resumen.ganancia).toBe(9);

    // Lo que se venda desde ahora cuesta Bs 7 y se vende a Bs 7: no deja nada.
    await vender(agua, 1);
    expect((await reporteDeVentas(agua)).resumen).toMatchObject({
      total: 28,
      costo: 19,
      ganancia: 9,
      margen: 32.14,
    });
  });

  it('una venta anulada no cuenta en la ganancia', async () => {
    const venta = await vender(agua, 2);
    await request(app)
      .post(`/api/ventas/${venta.body.id}/anular`)
      .set(cabecera(admin))
      .send({ motivo: 'Prueba de ganancia' })
      .expect(200);

    expect((await reporteDeVentas(agua)).resumen).toMatchObject({ total: 28, ganancia: 9 });
  });

  it('lo vendido sin costo no entra en la ganancia y se cuenta aparte', async () => {
    // Existencias cargadas sin nota de ingreso, como las del seed: sin costo.
    const te = await crearProducto(`Te ${sufijo()}`, 5);
    await prisma.producto_almacen.create({
      data: { id_producto: te, id_almacen: almacen, stock_actual: 10 },
    });

    await vender(te, 2);

    expect((await reporteDeVentas(te)).resumen).toMatchObject({
      total: 10,
      costo: null,
      ganancia: null,
      margen: null,
      unidadesSinCosto: 2,
    });
  });

  it('el PDF lleva la ganancia', async () => {
    const r = await request(app)
      .get('/api/reportes/ventas.pdf')
      .query({ desde: hoy(), hasta: hoy(), idProducto: agua })
      .set(cabecera(admin));

    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/pdf');
  });
});

describe('Reporte de pedidos · ganancia y filtro por producto', () => {
  it('filtrado por producto cuenta solo ese producto y deja fuera los cancelados', async () => {
    const cliente = await registrarCliente();
    const pedir = (items: { idProducto: number; cantidad: number }[]) =>
      request(app)
        .post('/api/pedidos')
        .set(cabecera(cliente.token))
        .send({
          metodoPago: 'Efectivo',
          ubicacion: { calle: 'Avenida Banzer', numero: '1200', referencia: 'Puerta verde' },
          items,
        })
        .expect(201);

    // Dos jugos y un agua en el mismo pedido: el reporte del jugo no cuenta el agua.
    const conAgua = await pedir([
      { idProducto: jugo, cantidad: 2 },
      { idProducto: agua, cantidad: 1 },
    ]);
    // Y uno cancelado, que no dejó dinero.
    const cancelado = await pedir([{ idProducto: jugo, cantidad: 5 }]);
    await request(app)
      .post(`/api/pedidos/${cancelado.body.id}/cancelar`)
      .set(cabecera(cliente.token))
      .expect(200);

    const r = await reporteDePedidos({ idProducto: jugo });

    expect(r.producto).toMatch(/^Jugo /);
    expect(r.resumen).toMatchObject({
      cantidadPedidos: 2,
      cancelados: 1,
      unidades: 2,
      total: 14,
      costo: 8,
      ganancia: 6,
      margen: 42.86,
    });
    expect(r.pedidos.find((p: { id: number }) => p.id === conAgua.body.id).total).toBe(14);
    expect(r.porProducto).toEqual([
      expect.objectContaining({ idProducto: jugo, unidades: 2, ganancia: 6 }),
    ]);
  });

  it('sin filtro, la tabla por producto trae la ganancia de cada uno', async () => {
    const r = await reporteDePedidos();

    const delJugo = r.porProducto.find((p: { idProducto: number }) => p.idProducto === jugo);
    expect(delJugo).toMatchObject({ unidades: 2, importe: 14, ganancia: 6 });
    expect(r.resumen.ganancia).toEqual(expect.any(Number));
  });
});
