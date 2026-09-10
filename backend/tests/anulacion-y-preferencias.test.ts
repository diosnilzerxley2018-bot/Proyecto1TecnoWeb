import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { obtenerToken, registrarCliente, buscarProducto, sufijo } from './ayudantes.js';

/**
 * Decisiones D1 a D4:
 *   D1 · anular una venta devuelve el stock;
 *   D3 · el almacén preferido devuelve la deducción del destino;
 *   D4 · el costo promedio se deduce de las notas de ingreso.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

async function vender(token: string, idProducto: number, cantidad: number, metodoPago = 'Efectivo') {
  return request(app)
    .post('/api/ventas')
    .set(cabecera(token))
    .send({ metodoPago, items: [{ idProducto, cantidad }] });
}

describe('D1 · Anular una venta', () => {
  it('devuelve el stock al inventario y deja la venta anulada', async () => {
    const staff = await obtenerToken();
    const antes = await buscarProducto('Barra de avena');

    const venta = await vender(staff, antes.id, 2);
    expect(venta.status).toBe(201);
    expect((await buscarProducto('Barra de avena')).stockDisponible).toBe(
      antes.stockDisponible - 2,
    );

    const r = await request(app)
      .post(`/api/ventas/${venta.body.id}/anular`)
      .set(cabecera(staff))
      .send({ motivo: 'El cliente se arrepintió' });

    expect(r.status).toBe(200);
    expect(r.body.venta.estadoPago).toBe('Anulado');
    expect((await buscarProducto('Barra de avena')).stockDisponible).toBe(antes.stockDisponible);
  });

  /**
   * El efectivo se cobra en el acto, de modo que anularlo implica devolver
   * dinero. El sistema lo registra pero no lo entrega, y tiene que decirlo.
   */
  it('avisa que hay dinero por devolver cuando la venta estaba cobrada', async () => {
    const staff = await obtenerToken();
    const producto = await buscarProducto('Barra de avena');
    const venta = await vender(staff, producto.id, 1);

    const r = await request(app)
      .post(`/api/ventas/${venta.body.id}/anular`)
      .set(cabecera(staff))
      .send({ motivo: 'Cobro duplicado por error' });

    expect(r.status).toBe(200);
    expect(r.body.requiereDevolucion).toBe(true);
    expect(r.body.aviso).toContain('devolverle el dinero');

    const cobro = await request(app)
      .get(`/api/pagos/${venta.body.cobro.id}`)
      .set(cabecera(staff));
    expect(cobro.body.estado).toBe('Reembolsado');
  });

  it('un cobro que nunca entró no genera devolución', async () => {
    const staff = await obtenerToken();
    const producto = await buscarProducto('Barra de avena');
    // El QR queda pendiente: el dinero no llegó.
    const venta = await vender(staff, producto.id, 1, 'QR');
    expect(venta.body.estadoPago).toBe('Pendiente');

    const r = await request(app)
      .post(`/api/ventas/${venta.body.id}/anular`)
      .set(cabecera(staff))
      .send({ motivo: 'El pago no se completó' });

    expect(r.status).toBe(200);
    expect(r.body.requiereDevolucion).toBe(false);

    const cobro = await request(app)
      .get(`/api/pagos/${venta.body.cobro.id}`)
      .set(cabecera(staff));
    expect(cobro.body.estado).toBe('Fallido');
  });

  it('no se anula dos veces, para no reponer el stock dos veces', async () => {
    const staff = await obtenerToken();
    const producto = await buscarProducto('Barra de avena');
    const venta = await vender(staff, producto.id, 1);

    await request(app)
      .post(`/api/ventas/${venta.body.id}/anular`)
      .set(cabecera(staff))
      .send({ motivo: 'Primera anulación' })
      .expect(200);

    const stockTrasAnular = (await buscarProducto('Barra de avena')).stockDisponible;

    const segunda = await request(app)
      .post(`/api/ventas/${venta.body.id}/anular`)
      .set(cabecera(staff))
      .send({ motivo: 'Segunda anulación' });

    expect(segunda.status).toBe(409);
    expect((await buscarProducto('Barra de avena')).stockDisponible).toBe(stockTrasAnular);
  });

  it('exige un motivo', async () => {
    const staff = await obtenerToken();
    const producto = await buscarProducto('Barra de avena');
    const venta = await vender(staff, producto.id, 1);

    const r = await request(app)
      .post(`/api/ventas/${venta.body.id}/anular`)
      .set(cabecera(staff))
      .send({});

    expect(r.status).toBe(400);
  });

  it('un cliente no puede anular ventas', async () => {
    const cliente = await registrarCliente();
    const r = await request(app)
      .post('/api/ventas/1/anular')
      .set(cabecera(cliente.token))
      .send({ motivo: 'Intento indebido' });

    expect(r.status).toBe(403);
  });
});

describe('D3 · Almacén preferido', () => {
  it('devuelve la deducción del destino cuando hay dos almacenes compatibles', async () => {
    const staff = await obtenerToken();
    const cab = cabecera(staff);

    const segundo = await request(app)
      .post('/api/almacenes')
      .set(cab)
      .send({ nombre: `Refrigerado preferido ${sufijo()}`, tipoConservacion: 'Refrigerado' })
      .expect(201);

    try {
      const recetas = await request(app).get('/api/productos').set(cab);
      const ensalada = recetas.body.find((p: { nombre: string }) =>
        p.nombre.startsWith('Ensalada Cesar'),
      );

      const versiones = await request(app)
        .get(`/api/productos/${ensalada.id}/recetas`)
        .set(cab);
      const activa = versiones.body.find((r: { activa: boolean }) => r.activa);

      // Con dos almacenes refrigerados y ninguno preferido, hay que indicarlo.
      const orden = await request(app)
        .post('/api/ordenes')
        .set(cab)
        .send({ idReceta: activa.id, cantidad: 1 })
        .expect(201);
      await request(app).post(`/api/ordenes/${orden.body.id}/iniciar`).set(cab).expect(200);

      const sinPreferido = await request(app)
        .post(`/api/ordenes/${orden.body.id}/finalizar`)
        .set(cab)
        .send({});
      expect(sinPreferido.status).toBe(409);
      expect(sinPreferido.body.error).toContain('marque uno como preferido');

      // Se designa uno y la ambigüedad desaparece.
      await request(app)
        .put(`/api/almacenes/${segundo.body.id}`)
        .set(cab)
        .send({ preferido: true })
        .expect(200);

      const conPreferido = await request(app)
        .post(`/api/ordenes/${orden.body.id}/finalizar`)
        .set(cab)
        .send({});
      expect(conPreferido.status).toBe(200);

      const ingreso = await request(app)
        .get(`/api/ingresos/${conPreferido.body.notas.ingreso}`)
        .set(cab);
      expect(ingreso.body.lineas[0].idAlmacen).toBe(segundo.body.id);
    } finally {
      await request(app)
        .put(`/api/almacenes/${segundo.body.id}`)
        .set(cab)
        .send({ preferido: false });
    }
  });

  it('designar un preferido desmarca al anterior de la misma conservación', async () => {
    const staff = await obtenerToken();
    const cab = cabecera(staff);

    const uno = await request(app)
      .post('/api/almacenes')
      .set(cab)
      .send({ nombre: `Pref A ${sufijo()}`, tipoConservacion: 'Refrigerado' })
      .expect(201);
    const dos = await request(app)
      .post('/api/almacenes')
      .set(cab)
      .send({ nombre: `Pref B ${sufijo()}`, tipoConservacion: 'Refrigerado' })
      .expect(201);

    try {
      await request(app).put(`/api/almacenes/${uno.body.id}`).set(cab).send({ preferido: true });
      await request(app).put(`/api/almacenes/${dos.body.id}`).set(cab).send({ preferido: true });

      const almacenes = await request(app).get('/api/almacenes').set(cab);
      const preferidos = almacenes.body.filter(
        (a: { tipoConservacion: string; preferido: boolean }) =>
          a.tipoConservacion === 'Refrigerado' && a.preferido,
      );

      // El índice parcial no admite dos: designar el segundo libera al primero.
      expect(preferidos).toHaveLength(1);
      expect(preferidos[0].id).toBe(dos.body.id);
    } finally {
      await request(app).put(`/api/almacenes/${dos.body.id}`).set(cab).send({ preferido: false });
      await request(app).delete(`/api/almacenes/${uno.body.id}`).set(cab);
      await request(app).delete(`/api/almacenes/${dos.body.id}`).set(cab);
    }
  });
});

describe('D4 · Costo promedio del producto', () => {
  it('se deduce de las notas de ingreso y avisa si el precio no lo cubre', async () => {
    const staff = await obtenerToken();
    const cab = cabecera(staff);

    const almacenes = await request(app).get('/api/almacenes').set(cab);
    const seco = almacenes.body.find((a: { nombre: string }) => a.nombre === 'Almacen Seco');
    const categorias = await request(app).get('/api/catalogo/categorias');

    const producto = await request(app)
      .post('/api/productos')
      .set(cab)
      .send({
        nombre: `Costeado ${sufijo()}`,
        precioVenta: 9,
        idCategoria: categorias.body[0].id,
        tipoConservacion: 'Seco',
      })
      .expect(201);

    // Sin ingresos todavía no hay costo que promediar.
    const nuevo = await request(app).get(`/api/productos/${producto.body.id}`).set(cab);
    expect(nuevo.body.costoPromedio).toBeNull();
    expect(nuevo.body.vendeBajoCosto).toBe(false);

    // 10 a Bs 8 y 10 a Bs 12 → promedio ponderado Bs 10.
    await request(app)
      .post('/api/ingresos')
      .set(cab)
      .send({
        productos: [{ idProducto: producto.body.id, idAlmacen: seco.id, cantidad: 10, costoUnitario: 8 }],
      })
      .expect(201);
    await request(app)
      .post('/api/ingresos')
      .set(cab)
      .send({
        productos: [{ idProducto: producto.body.id, idAlmacen: seco.id, cantidad: 10, costoUnitario: 12 }],
      })
      .expect(201);

    const costeado = await request(app).get(`/api/productos/${producto.body.id}`).set(cab);
    expect(costeado.body.costoPromedio).toBe(10);
    // Se vende a 9 y cuesta 10: no lo impide, pero lo dice.
    expect(costeado.body.vendeBajoCosto).toBe(true);
  });
});
