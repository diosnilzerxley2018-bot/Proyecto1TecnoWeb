import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { obtenerToken, registrarCliente, buscarProducto } from './ayudantes.js';

/** Dirección de entrega válida reutilizable (CU-PED-03). */
const UBICACION = {
  calle: 'Avenida Banzer',
  numero: '1200',
  referencia: 'Frente al parque, puerta verde',
};

function cuerpoPedido(idProducto: number, cantidad = 1, extra: Record<string, unknown> = {}) {
  return {
    metodoPago: 'Efectivo',
    ubicacion: UBICACION,
    items: [{ idProducto, cantidad }],
    ...extra,
  };
}

describe('CU-PED-01 Buscar productos', () => {
  it('expone el catálogo sin haber iniciado sesión', async () => {
    const r = await request(app).get('/api/catalogo');

    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body[0]).toHaveProperty('precio');
    expect(r.body[0]).toHaveProperty('valorNutricional');
  });

  it('busca por coincidencia parcial sin distinguir mayúsculas', async () => {
    const r = await request(app).get('/api/catalogo').query({ termino: 'ENSALADA' });

    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
    // CU-PED-01: la coincidencia puede darse por nombre o por categoría.
    for (const producto of r.body) {
      const coincide =
        producto.nombre.toLowerCase().includes('ensalada') ||
        producto.categoria.nombre.toLowerCase().includes('ensalada');
      expect(coincide).toBe(true);
    }
  });

  it('filtra por categoría', async () => {
    const categorias = await request(app).get('/api/catalogo/categorias');
    const bebidas = categorias.body.find((c: { nombre: string }) => c.nombre === 'Bebidas naturales');

    const r = await request(app).get('/api/catalogo').query({ categoria: bebidas.id });

    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
    for (const producto of r.body) {
      expect(producto.categoria.id).toBe(bebidas.id);
    }
  });

  it('devuelve una lista vacía cuando no hay coincidencias', async () => {
    const r = await request(app).get('/api/catalogo').query({ termino: 'zzzzinexistente' });

    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it('nunca expone la receta ni sus instrucciones', async () => {
    const r = await request(app).get('/api/catalogo');

    expect(JSON.stringify(r.body)).not.toContain('instrucciones');
    expect(JSON.stringify(r.body)).not.toContain('receta');
  });

  it('responde 404 para un producto inexistente', async () => {
    const r = await request(app).get('/api/catalogo/999999');

    expect(r.status).toBe(404);
  });
});

describe('CU-PED-02 Gestionar pedido', () => {
  it('confirma un pedido y calcula el total en el servidor', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Jugo verde');

    const r = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(producto.id, 3));

    expect(r.status).toBe(201);
    expect(r.body.estadoPedido).toBe('Recibido');
    expect(r.body.total).toBe(producto.precio * 3);
    expect(r.body.items[0].cantidad).toBe(3);
    expect(r.body.ubicacion.calle).toBe(UBICACION.calle);
  });

  it('descuenta el stock al confirmar («include» Verificar Disponibilidad)', async () => {
    const { token } = await registrarCliente();
    const antes = await buscarProducto('Limonada');

    await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(antes.id, 4))
      .expect(201);

    const despues = await buscarProducto('Limonada');
    expect(despues.stockDisponible).toBe(antes.stockDisponible - 4);
  });

  it('impide confirmar si la cantidad supera el stock e informa lo disponible', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Mousse');

    const r = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(producto.id, producto.stockDisponible + 1));

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Stock insuficiente');
    expect(r.body.error).toContain(`disponible ${producto.stockDisponible}`);

    const despues = await buscarProducto('Mousse');
    expect(despues.stockDisponible).toBe(producto.stockDisponible);
  });

  it('agrupa las líneas repetidas del mismo producto', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Wrap integral');

    const r = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        metodoPago: 'Efectivo',
        ubicacion: UBICACION,
        items: [
          { idProducto: producto.id, cantidad: 2 },
          { idProducto: producto.id, cantidad: 3 },
        ],
      });

    expect(r.status).toBe(201);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].cantidad).toBe(5);
  });

  it('rechaza el pedido de un empleado: los pedidos son de clientes', async () => {
    const token = await obtenerToken();
    const producto = await buscarProducto('Bowl de quinua');

    const r = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(producto.id));

    expect(r.status).toBe(403);
    expect(r.body.error).toContain('clientes registrados');
  });

  it('exige sesión iniciada', async () => {
    const producto = await buscarProducto('Barra de avena');
    const r = await request(app).post('/api/pedidos').send(cuerpoPedido(producto.id));

    expect(r.status).toBe(401);
  });

  it('un cliente no puede ver el pedido de otro', async () => {
    const primero = await registrarCliente();
    const segundo = await registrarCliente();
    const producto = await buscarProducto('Galletas de avena');

    const creado = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${primero.token}`)
      .send(cuerpoPedido(producto.id))
      .expect(201);

    const r = await request(app)
      .get(`/api/pedidos/${creado.body.id}`)
      .set('Authorization', `Bearer ${segundo.token}`);

    expect(r.status).toBe(404);
  });

  it('lista únicamente los pedidos del cliente autenticado', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Ensalada mediterranea');

    await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(producto.id))
      .expect(201);

    const r = await request(app).get('/api/pedidos').set('Authorization', `Bearer ${token}`);

    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].cancelable).toBe(true);
  });

  /**
   * El listado alimenta la ficha desplegable de «Mis pedidos», que muestra la
   * dirección y los platos sin volver a consultar. Cuando el endpoint servía un
   * resumen recortado, el portal se caía al leer `ubicacion.calle` de un objeto
   * que no venía. La prueba anterior solo miraba `cancelable` y no lo vio.
   */
  it('el listado trae el pedido completo, no un resumen', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Ensalada mediterranea');

    await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(producto.id, 2))
      .expect(201);

    const r = await request(app).get('/api/pedidos').set('Authorization', `Bearer ${token}`);

    expect(r.status).toBe(200);
    const [pedido] = r.body;
    expect(pedido.ubicacion.calle).toBe(UBICACION.calle);
    expect(pedido.items).toHaveLength(1);
    expect(pedido.items[0].cantidad).toBe(2);
    expect(pedido).toHaveProperty('referenciaPago');
  });
});

describe('CU-PED-03 Gestionar ubicación', () => {
  it('exige la calle y la referencia', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Jugo verde');

    const r = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(producto.id, 1, { ubicacion: { calle: 'Av. Alemana' } }));

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('referencia');
  });

  it('rechaza coordenadas fuera del rango admitido', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Jugo verde');

    const r = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(
        cuerpoPedido(producto.id, 1, {
          ubicacion: { ...UBICACION, latitud: -120, longitud: -63.18 },
        }),
      );

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('latitud');
  });

  it('acepta coordenadas válidas y las devuelve en el detalle', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Jugo verde');

    const r = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(
        cuerpoPedido(producto.id, 1, {
          ubicacion: { ...UBICACION, latitud: -17.783, longitud: -63.182 },
        }),
      );

    expect(r.status).toBe(201);
    expect(r.body.ubicacion.latitud).toBeCloseTo(-17.783, 3);
    expect(r.body.ubicacion.longitud).toBeCloseTo(-63.182, 3);
  });
});

describe('CU-PED-04 Pagar pedido en línea', () => {
  it('el pago en efectivo deja el cobro pendiente', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Barra de avena');

    const r = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(producto.id));

    expect(r.status).toBe(201);
    expect(r.body.estadoPago).toBe('Pendiente');
  });

  /**
   * Antes bastaba con escribir cuatro caracteres cualesquiera en el campo de
   * referencia para que el pedido naciera pagado. La referencia ya no se
   * acepta del cliente: si la envía, se ignora.
   */
  it('ignora la referencia de pago que envíe el cliente', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Barra de avena');

    const r = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(producto.id, 1, { metodoPago: 'QR', referenciaPago: 'INVENTADA-1234' }));

    expect(r.status).toBe(201);
    expect(r.body.referenciaPago).not.toBe('INVENTADA-1234');
  });

  it('el pago en línea deja el pedido esperando al cobro, no pagado', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Barra de avena');

    const r = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(producto.id, 1, { metodoPago: 'QR' }));

    expect(r.status).toBe(201);
    expect(r.body.estadoPedido).toBe('Pendiente de pago');
    expect(r.body.estadoPago).toBe('Pendiente');

    // El cobro viene con lo que hay que mostrarle al cliente.
    expect(r.body.cobro.estado).toBe('Pendiente');
    expect(r.body.cobro.simulado).toBe(true);
    expect(r.body.cobro.datosCobro).toContain('NUTRIEXPRESS-SIMULADO');
    expect(r.body.cobro.datosCobro).toContain('monto=');
  });

  it('el pedido en efectivo entra directo a la cola, sin cobro pendiente', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Barra de avena');

    const r = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(producto.id, 1, { metodoPago: 'Efectivo' }));

    expect(r.status).toBe(201);
    expect(r.body.estadoPedido).toBe('Recibido');
    expect(r.body.cobro.metodo).toBe('Efectivo');
    expect(r.body.cobro.pasarela).toBe('Mostrador');
  });

  it('rechaza un método de pago no admitido por el esquema', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Barra de avena');

    const r = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(producto.id, 1, { metodoPago: 'Cheque', referenciaPago: 'X-1' }));

    expect(r.status).toBe(400);
  });
});

describe('CU-PED-02 Cancelación del pedido', () => {
  it('cancela y repone el stock descontado', async () => {
    const { token } = await registrarCliente();
    const antes = await buscarProducto('Pechuga a la plancha');

    const creado = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(antes.id, 2))
      .expect(201);

    const conPedido = await buscarProducto('Pechuga a la plancha');
    expect(conPedido.stockDisponible).toBe(antes.stockDisponible - 2);

    const r = await request(app)
      .post(`/api/pedidos/${creado.body.id}/cancelar`)
      .set('Authorization', `Bearer ${token}`);

    expect(r.status).toBe(200);
    expect(r.body.estadoPedido).toBe('Cancelado');
    expect(r.body.cancelable).toBe(false);

    const repuesto = await buscarProducto('Pechuga a la plancha');
    expect(repuesto.stockDisponible).toBe(antes.stockDisponible);
  });

  it('no permite cancelar dos veces el mismo pedido', async () => {
    const { token } = await registrarCliente();
    const producto = await buscarProducto('Ensalada Cesar');

    const creado = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpoPedido(producto.id))
      .expect(201);

    await request(app)
      .post(`/api/pedidos/${creado.body.id}/cancelar`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const r = await request(app)
      .post(`/api/pedidos/${creado.body.id}/cancelar`)
      .set('Authorization', `Bearer ${token}`);

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Cancelado');
  });

  it('un cliente no puede cancelar el pedido de otro', async () => {
    const primero = await registrarCliente();
    const segundo = await registrarCliente();
    const producto = await buscarProducto('Ensalada Cesar');

    const creado = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${primero.token}`)
      .send(cuerpoPedido(producto.id))
      .expect(201);

    const r = await request(app)
      .post(`/api/pedidos/${creado.body.id}/cancelar`)
      .set('Authorization', `Bearer ${segundo.token}`);

    expect(r.status).toBe(404);
  });
});
