import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { buscarProducto, crearEmpleado, obtenerToken, registrarCliente } from './ayudantes.js';
import { MensajeroSimulado, reiniciarMensajero } from '../src/correo/index.js';
import { referenciaDeCobro } from '../src/services/pago.service.js';

/**
 * El comprobante del pedido pagado (RF-VEN-06 llevado al portal).
 *
 * Quien pagaba en el mostrador se iba con su comprobante; quien pagaba su
 * pedido en línea no recibía ninguna constancia. Ahora lo ve en pantalla, lo
 * descarga en PDF y le llega solo al correo al pagar.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });
/**
 * El soporte configurado del negocio. Se consulta y no se supone: otras pruebas
 * editan el correo del negocio y, según el orden de los archivos, esta lo
 * encontraba cambiado.
 */
const soporte = async () => (await request(app).get('/api/negocio')).body.correo as string;

async function pedir(token: string, metodoPago: 'QR' | 'Efectivo') {
  const producto = await buscarProducto('Barra de avena');
  const r = await request(app)
    .post('/api/pedidos')
    .set(cabecera(token))
    .send({
      metodoPago,
      ubicacion: { calle: 'Avenida Banzer', numero: '1200', referencia: 'Portón verde' },
      items: [{ idProducto: producto.id, cantidad: 2 }],
    });
  expect(r.status).toBe(201);
  return r.body as { id: number; total: number; cobro: { id: number } };
}

/** La pasarela avisa que el cobro en línea entró. */
async function confirmarPago(pedido: { id: number; total: number; cobro: { id: number } }) {
  const ref = referenciaDeCobro(`PEDIDO-${pedido.id}`, pedido.cobro.id);
  const r = await request(app)
    .get('/api/pagos/notificacion')
    .query({ testigo: 'x', ref, transaction_id: ref, estado: 'Pagado', monto: String(pedido.total) });
  expect(r.body.procesado).toBe(true);
}

/** Un cliente con un pedido pagado con QR, y el buzón limpio. */
async function pedidoPagado() {
  const cliente = await registrarCliente();
  const pedido = await pedir(cliente.token, 'QR');
  await confirmarPago(pedido);
  return { cliente, pedido };
}

const correoDe = (cliente: { nombreUsuario: string }) => `${cliente.nombreUsuario}@correo.bo`;
const esperarCorreo = (parte: string) =>
  vi.waitFor(() => expect(MensajeroSimulado.enviados.some((m) => m.asunto.includes(parte))).toBe(true));

beforeEach(() => reiniciarMensajero());

describe('Comprobante · al pagar', () => {
  it('confirmado el pago en línea, al cliente le llega su comprobante con el PDF', async () => {
    const { cliente, pedido } = await pedidoPagado();
    await esperarCorreo('Comprobante de pago');

    const correo = MensajeroSimulado.enviados.find((m) => m.asunto.includes('Comprobante de pago'))!;
    expect(correo.asunto).toContain(String(pedido.id).padStart(5, '0'));
    expect(correo.para).toEqual([correoDe(cliente)]);
    // Si responde, le contesta el soporte, no la cuenta que envía.
    expect(correo.responderA).toBe(await soporte());
    expect(correo.adjuntos?.[0].tipo).toBe('application/pdf');
    expect(correo.adjuntos?.[0].contenido.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('en efectivo le llega al entregarse, en lugar del aviso de entregado', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const pedido = await pedir(cliente.token, 'Efectivo');
    const repartidor = await crearEmpleado('Repartidor');
    await request(app)
      .put(`/api/gestion/pedidos/${pedido.id}/repartidor`)
      .set(cabecera(staff))
      .send({ idRepartidor: repartidor.id })
      .expect(200);
    for (const estado of ['En preparacion', 'En camino']) {
      await request(app)
        .patch(`/api/gestion/pedidos/${pedido.id}/estado`)
        .set(cabecera(staff))
        .send({ estado })
        .expect(200);
    }
    await esperarCorreo('camino');
    reiniciarMensajero();

    await request(app)
      .patch(`/api/gestion/pedidos/${pedido.id}/estado`)
      .set(cabecera(repartidor.token))
      .send({ estado: 'Entregado' })
      .expect(200);
    await esperarCorreo('entregado');

    // Un solo correo: el de entregado ya trae el comprobante.
    expect(MensajeroSimulado.enviados).toHaveLength(1);
    const [correo] = MensajeroSimulado.enviados;
    expect(correo.texto).toMatch(/Pagó Bs [\d.,]+ en efectivo/);
    expect(correo.adjuntos?.[0].tipo).toBe('application/pdf');

    const comprobante = await request(app)
      .get(`/api/pedidos/${pedido.id}/comprobante`)
      .set(cabecera(cliente.token));
    expect(comprobante.body.metodoPago).toBe('Efectivo');
    expect(comprobante.body.pagadoEn).not.toBeNull();
    expect(comprobante.body.referenciaPago).toBeNull();
  });
});

describe('Comprobante · en pantalla y en PDF', () => {
  it('muestra el pedido pagado como un tique', async () => {
    const { cliente, pedido } = await pedidoPagado();

    const r = await request(app)
      .get(`/api/pedidos/${pedido.id}/comprobante`)
      .set(cabecera(cliente.token));

    expect(r.status).toBe(200);
    expect(r.body.numero).toBe(`Pedido #${String(pedido.id).padStart(5, '0')}`);
    expect(r.body.metodoPago).toBe('QR');
    expect(r.body.entrega).toBe('Avenida Banzer 1200 · Portón verde');
    expect(r.body.detalle).toHaveLength(1);
    expect(r.body.cantidadItems).toBe(2);
    expect(r.body.total).toBe(pedido.total);
    expect(r.body.pagadoEn).not.toBeNull();
    expect(r.body.soporte).toBe(await soporte());
  });

  it('un pedido sin pagar todavía no tiene comprobante', async () => {
    const cliente = await registrarCliente();
    const pedido = await pedir(cliente.token, 'Efectivo');

    const r = await request(app)
      .get(`/api/pedidos/${pedido.id}/comprobante`)
      .set(cabecera(cliente.token));

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('cuando recibe su pedido');
  });

  it('el comprobante de otro cliente se responde como inexistente', async () => {
    const { pedido } = await pedidoPagado();
    const otro = await registrarCliente();

    await request(app)
      .get(`/api/pedidos/${pedido.id}/comprobante`)
      .set(cabecera(otro.token))
      .expect(404);
    await request(app)
      .post(`/api/pedidos/${pedido.id}/comprobante/enviar`)
      .set(cabecera(otro.token))
      .expect(404);
  });

  it('se descarga en PDF', async () => {
    const { cliente, pedido } = await pedidoPagado();

    const r = await request(app)
      .get(`/api/pedidos/${pedido.id}/comprobante.pdf`)
      .set(cabecera(cliente.token))
      .buffer(true)
      .parse((res, fin) => {
        const trozos: Buffer[] = [];
        res.on('data', (t: Buffer) => trozos.push(t));
        res.on('end', () => fin(null, Buffer.concat(trozos)));
      });

    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/pdf');
    expect((r.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('Comprobante · enviar al correo', () => {
  it('va al correo de la cuenta aunque la petición pida otro', async () => {
    const { cliente, pedido } = await pedidoPagado();
    await esperarCorreo('Comprobante de pago');
    reiniciarMensajero();

    const r = await request(app)
      .post(`/api/pedidos/${pedido.id}/comprobante/enviar`)
      .set(cabecera(cliente.token))
      .send({ para: 'cualquiera@example.com' });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ enviado: true, para: correoDe(cliente) });
    expect(MensajeroSimulado.enviados).toHaveLength(1);
    expect(MensajeroSimulado.enviados[0].para).toEqual([correoDe(cliente)]);
    expect(MensajeroSimulado.enviados[0].asunto).toContain('Comprobante del pedido');
  });

  it('corta los envíos seguidos para no gastar el tope de la cuenta que envía', async () => {
    const { cliente, pedido } = await pedidoPagado();
    const enviar = () =>
      request(app).post(`/api/pedidos/${pedido.id}/comprobante/enviar`).set(cabecera(cliente.token));

    for (let i = 0; i < 5; i++) await enviar().expect(200);
    const sexto = await enviar();

    expect(sexto.status).toBe(429);
    expect(sexto.body.error).toContain('Espere unos minutos');
  });
});
