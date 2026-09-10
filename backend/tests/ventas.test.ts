import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { obtenerToken, registrarCliente, buscarProducto, sufijo } from './ayudantes.js';

/**
 * Etapa 6: CU-VEN-01 Gestionar Venta y CU-VEN-02 Gestionar Cliente.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

/** El rol Empleado tiene VENTA_REGISTRAR, VENTA_LEER y CLIENTE_GESTIONAR. */
const tokenEmpleado = () => obtenerToken('repartidor', 'Reparto1234!');

async function registrarVenta(token: string, cuerpo: Record<string, unknown>) {
  return request(app).post('/api/ventas').set(cabecera(token)).send(cuerpo);
}

describe('CU-VEN-01 Gestionar venta', () => {
  it('registra una venta y calcula el total en el servidor', async () => {
    const staff = await tokenEmpleado();
    const producto = await buscarProducto('Galletas de avena');

    const r = await registrarVenta(staff, {
      tipoVenta: 'Mesa',
      metodoPago: 'Efectivo',
      items: [{ idProducto: producto.id, cantidad: 3 }],
    });

    expect(r.status).toBe(201);
    expect(r.body.tipoVenta).toBe('Mesa');
    expect(r.body.total).toBe(producto.precio * 3);
    expect(r.body.items[0].subtotal).toBe(producto.precio * 3);
    expect(r.body.atendidoPor.nombreCompleto).toContain('Marcos');
  });

  it('descuenta el stock («include» Verificar Disponibilidad)', async () => {
    const staff = await tokenEmpleado();
    const antes = await buscarProducto('Galletas de avena');

    await registrarVenta(staff, {
      metodoPago: 'QR',
      items: [{ idProducto: antes.id, cantidad: 2 }],
    }).then((r) => expect(r.status).toBe(201));

    const despues = await buscarProducto('Galletas de avena');
    expect(despues.stockDisponible).toBe(antes.stockDisponible - 2);
  });

  it('registra el almacén de origen en el detalle, sin nota de egreso', async () => {
    const staff = await tokenEmpleado();
    const producto = await buscarProducto('Galletas de avena');
    const egresosAntes = await request(app).get('/api/egresos').set(cabecera(staff));

    const r = await registrarVenta(staff, {
      metodoPago: 'Efectivo',
      items: [{ idProducto: producto.id, cantidad: 1 }],
    });

    expect(r.status).toBe(201);
    expect(r.body.items[0].almacen).toBe('Almacen Seco');

    // La venta es su propio documento: no genera nota de egreso.
    const egresosDespues = await request(app).get('/api/egresos').set(cabecera(staff));
    expect(egresosDespues.body.total).toBe(egresosAntes.body.total);
  });

  it('impide vender más de lo disponible e informa la cantidad', async () => {
    const staff = await tokenEmpleado();
    const producto = await buscarProducto('Mousse');
    const ventasAntes = await request(app).get('/api/ventas').set(cabecera(staff));

    const r = await registrarVenta(staff, {
      metodoPago: 'Efectivo',
      items: [{ idProducto: producto.id, cantidad: producto.stockDisponible + 5 }],
    });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Stock insuficiente');
    expect(r.body.error).toContain(`disponible ${producto.stockDisponible}`);

    // La transacción se revierte por completo.
    const despues = await buscarProducto('Mousse');
    expect(despues.stockDisponible).toBe(producto.stockDisponible);

    const ventasDespues = await request(app).get('/api/ventas').set(cabecera(staff));
    expect(ventasDespues.body.total).toBe(ventasAntes.body.total);
  });

  it('se registra sin cliente cuando no se indica ninguno', async () => {
    const staff = await tokenEmpleado();
    const producto = await buscarProducto('Galletas de avena');

    const r = await registrarVenta(staff, {
      metodoPago: 'Efectivo',
      items: [{ idProducto: producto.id, cantidad: 1 }],
    });

    expect(r.status).toBe(201);
    expect(r.body.cliente).toBeNull();
  });

  it('puede asociarse a un cliente registrado', async () => {
    const staff = await tokenEmpleado();
    const cliente = await registrarCliente();
    const perfil = await request(app).get('/api/clientes/perfil').set(cabecera(cliente.token));
    const producto = await buscarProducto('Galletas de avena');

    const r = await registrarVenta(staff, {
      metodoPago: 'Tarjeta',
      idCliente: perfil.body.id,
      items: [{ idProducto: producto.id, cantidad: 1 }],
    });

    expect(r.status).toBe(201);
    expect(r.body.cliente.id).toBe(perfil.body.id);
  });

  it('rechaza un cliente inexistente', async () => {
    const staff = await tokenEmpleado();
    const producto = await buscarProducto('Galletas de avena');

    const r = await registrarVenta(staff, {
      metodoPago: 'Efectivo',
      idCliente: 999999,
      items: [{ idProducto: producto.id, cantidad: 1 }],
    });

    expect(r.status).toBe(404);
    expect(r.body.error).toContain('cliente');
  });

  it('agrupa las líneas repetidas del mismo producto', async () => {
    const staff = await tokenEmpleado();
    const producto = await buscarProducto('Galletas de avena');

    const r = await registrarVenta(staff, {
      metodoPago: 'Efectivo',
      items: [
        { idProducto: producto.id, cantidad: 1 },
        { idProducto: producto.id, cantidad: 2 },
      ],
    });

    expect(r.status).toBe(201);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].cantidad).toBe(3);
  });

  it('rechaza un tipo de venta fuera del esquema', async () => {
    const staff = await tokenEmpleado();
    const producto = await buscarProducto('Galletas de avena');

    const r = await registrarVenta(staff, {
      tipoVenta: 'Delivery',
      metodoPago: 'Efectivo',
      items: [{ idProducto: producto.id, cantidad: 1 }],
    });

    expect(r.status).toBe(400);
  });

  it('rechaza una venta sin productos', async () => {
    const staff = await tokenEmpleado();
    const r = await registrarVenta(staff, { metodoPago: 'Efectivo', items: [] });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('al menos un producto');
  });

  it('filtra el listado por tipo de venta', async () => {
    const staff = await tokenEmpleado();
    const r = await request(app).get('/api/ventas').query({ tipo: 'Mesa' }).set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.datos.length).toBeGreaterThan(0);
    for (const venta of r.body.datos) expect(venta.tipoVenta).toBe('Mesa');
  });

  it('un cliente no puede registrar ventas', async () => {
    const cliente = await registrarCliente();
    const r = await request(app).get('/api/ventas').set(cabecera(cliente.token));
    expect(r.status).toBe(403);
  });
});

describe('RF-VEN-06 Comprobante de la venta', () => {
  it('genera el comprobante con su numeración y totales', async () => {
    const staff = await tokenEmpleado();
    const producto = await buscarProducto('Galletas de avena');

    const venta = await registrarVenta(staff, {
      tipoVenta: 'Llevar',
      metodoPago: 'QR',
      items: [{ idProducto: producto.id, cantidad: 2 }],
    });
    expect(venta.status).toBe(201);

    const r = await request(app)
      .get(`/api/ventas/${venta.body.id}/comprobante`)
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.numero).toBe(`V-${String(venta.body.id).padStart(6, '0')}`);
    expect(r.body.tipoVenta).toBe('Llevar');
    expect(r.body.cliente).toBe('Consumidor final');
    expect(r.body.cantidadItems).toBe(2);
    expect(r.body.total).toBe(producto.precio * 2);
    expect(r.body.detalle).toHaveLength(1);
  });

  it('nombra al cliente cuando la venta está asociada a uno', async () => {
    const staff = await tokenEmpleado();
    const cliente = await registrarCliente();
    const perfil = await request(app).get('/api/clientes/perfil').set(cabecera(cliente.token));
    const producto = await buscarProducto('Galletas de avena');

    const venta = await registrarVenta(staff, {
      metodoPago: 'Efectivo',
      idCliente: perfil.body.id,
      items: [{ idProducto: producto.id, cantidad: 1 }],
    });

    const r = await request(app)
      .get(`/api/ventas/${venta.body.id}/comprobante`)
      .set(cabecera(staff));

    expect(r.body.cliente).toContain('Cliente');
  });

  it('responde 404 por una venta inexistente', async () => {
    const staff = await tokenEmpleado();
    const r = await request(app).get('/api/ventas/999999/comprobante').set(cabecera(staff));
    expect(r.status).toBe(404);
  });
});

describe('CU-VEN-02 Gestionar cliente', () => {
  it('el personal lista las fichas con sus operaciones asociadas', async () => {
    const staff = await tokenEmpleado();
    await registrarCliente();

    const r = await request(app).get('/api/clientes').set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.datos.length).toBeGreaterThan(0);
    expect(r.body.datos[0]).toHaveProperty('cantidadPedidos');
    expect(r.body.datos[0]).toHaveProperty('cantidadVentas');
    expect(r.body.datos[0]).toHaveProperty('preferenciaAlimentaria');
  });

  it('el personal busca por nombre o correo', async () => {
    const staff = await tokenEmpleado();
    const cliente = await registrarCliente();

    const r = await request(app)
      .get('/api/clientes')
      .query({ termino: cliente.nombreUsuario })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.datos).toHaveLength(1);
    expect(r.body.datos[0].email).toContain(cliente.nombreUsuario);
  });

  it('el personal modifica la ficha de un cliente', async () => {
    const staff = await tokenEmpleado();
    const cliente = await registrarCliente();
    const perfil = await request(app).get('/api/clientes/perfil').set(cabecera(cliente.token));

    const r = await request(app)
      .put(`/api/clientes/${perfil.body.id}`)
      .set(cabecera(staff))
      .send({ telefono: '77712345', preferenciaAlimentaria: 'Vegetariana' });

    expect(r.status).toBe(200);
    expect(r.body.telefono).toBe('77712345');
    expect(r.body.preferenciaAlimentaria).toBe('Vegetariana');
  });

  it('el cliente consulta y modifica sus propios datos', async () => {
    const cliente = await registrarCliente();

    const antes = await request(app).get('/api/clientes/perfil').set(cabecera(cliente.token));
    expect(antes.status).toBe(200);
    expect(antes.body.restriccionDietetica).toBeNull();

    const r = await request(app)
      .put('/api/clientes/perfil')
      .set(cabecera(cliente.token))
      .send({ nombre: 'Nombre corregido', restriccionDietetica: 'Sin gluten' });

    expect(r.status).toBe(200);
    expect(r.body.nombre).toBe('Nombre corregido');
    expect(r.body.restriccionDietetica).toBe('Sin gluten');
  });

  it('el cliente no puede modificar la ficha de otro cliente', async () => {
    const primero = await registrarCliente();
    const segundo = await registrarCliente();
    const ficha = await request(app).get('/api/clientes/perfil').set(cabecera(segundo.token));

    const r = await request(app)
      .put(`/api/clientes/${ficha.body.id}`)
      .set(cabecera(primero.token))
      .send({ nombre: 'Intruso' });

    expect(r.status).toBe(403);
  });

  it('el cliente no puede darse de baja a sí mismo', async () => {
    const cliente = await registrarCliente();

    const r = await request(app)
      .put('/api/clientes/perfil')
      .set(cabecera(cliente.token))
      .send({ activo: false });

    // `activo` no forma parte del esquema de autoservicio: se ignora.
    expect(r.status).toBe(200);
    expect(r.body.activo).toBe(true);
  });

  it('rechaza un correo ya registrado', async () => {
    const primero = await registrarCliente();
    const segundo = await registrarCliente();
    const fichaPrimero = await request(app)
      .get('/api/clientes/perfil')
      .set(cabecera(primero.token));

    const r = await request(app)
      .put('/api/clientes/perfil')
      .set(cabecera(segundo.token))
      .send({ email: fichaPrimero.body.email });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('ya está registrado');
  });

  it('acepta conservar el mismo correo al modificar otros datos', async () => {
    const cliente = await registrarCliente();
    const ficha = await request(app).get('/api/clientes/perfil').set(cabecera(cliente.token));

    const r = await request(app)
      .put('/api/clientes/perfil')
      .set(cabecera(cliente.token))
      .send({ email: ficha.body.email, telefono: '76500000' });

    expect(r.status).toBe(200);
    expect(r.body.telefono).toBe('76500000');
  });

  it('rechaza un correo con formato inválido', async () => {
    const cliente = await registrarCliente();

    const r = await request(app)
      .put('/api/clientes/perfil')
      .set(cabecera(cliente.token))
      .send({ email: `no-es-correo-${sufijo()}` });

    expect(r.status).toBe(400);
  });

  it('un empleado no tiene ficha de cliente', async () => {
    const staff = await tokenEmpleado();
    const r = await request(app).get('/api/clientes/perfil').set(cabecera(staff));

    expect(r.status).toBe(403);
    expect(r.body.error).toContain('clientes registrados');
  });

  it('responde 404 por un cliente inexistente', async () => {
    const staff = await tokenEmpleado();
    const r = await request(app).get('/api/clientes/999999').set(cabecera(staff));
    expect(r.status).toBe(404);
  });
});

describe('Venta que sale de más de un almacén', () => {
  /**
   * El caso que rompió el comprobante en desarrollo: había 6 unidades en un
   * almacén y 1 en otro, se vendieron 7, y `detalle_venta` —cuya clave primaria
   * es (venta, producto, almacén)— generó dos filas del mismo producto.
   */
  async function productoEnDosAlmacenes() {
    const cab = cabecera(await obtenerToken());

    // Se usa la conservación Refrigerada a propósito: varias pruebas de
    // producción dependen de que exista **un solo** almacén Seco para poder
    // deducir el destino, y un segundo lo volvería ambiguo.
    const almacenes = await request(app).get('/api/almacenes').set(cab);
    const principal = almacenes.body.find(
      (a: { nombre: string }) => a.nombre === 'Camara Refrigerada',
    );

    const segundo = await request(app)
      .post('/api/almacenes')
      .set(cab)
      .send({ nombre: `Refrigerado auxiliar ${sufijo()}`, tipoConservacion: 'Refrigerado' })
      .expect(201);

    const categorias = await request(app).get('/api/catalogo/categorias');
    const producto = await request(app)
      .post('/api/productos')
      .set(cab)
      .send({
        nombre: `Repartido ${sufijo()}`,
        precioVenta: 5,
        idCategoria: categorias.body[0].id,
        tipoConservacion: 'Refrigerado',
      })
      .expect(201);

    // 6 en un almacén y 1 en el otro: exactamente el escenario reportado.
    await request(app)
      .post('/api/ingresos')
      .set(cab)
      .send({
        productos: [
          { idProducto: producto.body.id, idAlmacen: principal.id, cantidad: 6, costoUnitario: 2 },
          { idProducto: producto.body.id, idAlmacen: segundo.body.id, cantidad: 1, costoUnitario: 2 },
        ],
      })
      .expect(201);

    return { idProducto: producto.body.id as number, idAlmacenExtra: segundo.body.id as number };
  }

  it('toma de los dos almacenes y lo documenta en el detalle', async () => {
    const staff = await tokenEmpleado();
    const { idProducto } = await productoEnDosAlmacenes();

    const venta = await registrarVenta(staff, {
      metodoPago: 'Efectivo',
      items: [{ idProducto, cantidad: 7 }],
    });

    expect(venta.status).toBe(201);
    expect(venta.body.total).toBe(35);

    // Dos líneas del mismo producto: una por almacén de origen.
    expect(venta.body.items).toHaveLength(2);
    expect(new Set(venta.body.items.map((i: { almacen: string }) => i.almacen)).size).toBe(2);
    expect(
      venta.body.items.reduce((s: number, i: { cantidad: number }) => s + i.cantidad, 0),
    ).toBe(7);
  });

  it('el comprobante une esas líneas: el cliente compró 7, no 6 y 1', async () => {
    const staff = await tokenEmpleado();
    const { idProducto } = await productoEnDosAlmacenes();

    const venta = await registrarVenta(staff, {
      metodoPago: 'Efectivo',
      items: [{ idProducto, cantidad: 7 }],
    });

    const comprobante = await request(app)
      .get(`/api/ventas/${venta.body.id}/comprobante`)
      .set(cabecera(staff));

    expect(comprobante.status).toBe(200);
    expect(comprobante.body.detalle).toHaveLength(1);
    expect(comprobante.body.detalle[0].cantidad).toBe(7);
    expect(comprobante.body.detalle[0].subtotal).toBe(35);
    expect(comprobante.body.cantidadItems).toBe(7);
    expect(comprobante.body.total).toBe(35);
  });
});
