import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { crearEmpleado, crearPedido, obtenerToken, registrarCliente } from './ayudantes.js';

/**
 * Seguimiento del repartidor en vivo.
 *
 * El repartidor comparte su posición mientras lleva un pedido, y el cliente
 * de ese pedido —y el personal— la ven. Lo que se comprueba son los límites:
 * solo En camino, solo el pedido propio, y nada guardado al terminar.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

const PLAZA = { latitud: -17.783327, longitud: -63.182076, precision: 12 };

/** Un pedido en preparación, con repartidor asignado y todavía en el local. */
async function pedidoPorSalir() {
  const staff = await obtenerToken();
  const cliente = await registrarCliente();
  const idPedido = await crearPedido(cliente.token, 'Jugo verde');
  const repartidor = await crearEmpleado('Repartidor');

  await request(app)
    .patch(`/api/gestion/pedidos/${idPedido}/estado`)
    .set(cabecera(staff))
    .send({ estado: 'En preparacion' })
    .expect(200);
  await request(app)
    .put(`/api/gestion/pedidos/${idPedido}/repartidor`)
    .set(cabecera(staff))
    .send({ idRepartidor: repartidor.id })
    .expect(200);

  return { staff, cliente, idPedido, repartidor };
}

/** El mismo pedido, ya en la calle. */
async function pedidoEnCamino() {
  const datos = await pedidoPorSalir();
  await request(app)
    .patch(`/api/gestion/pedidos/${datos.idPedido}/estado`)
    .set(cabecera(datos.repartidor.token))
    .send({ estado: 'En camino' })
    .expect(200);
  return datos;
}

const informar = (token: string, cuerpo: object = PLAZA) =>
  request(app).put('/api/gestion/mi-posicion').set(cabecera(token)).send(cuerpo);

const seguirComoCliente = (token: string, idPedido: number) =>
  request(app).get(`/api/pedidos/${idPedido}/seguimiento`).set(cabecera(token));

describe('Seguimiento · el repartidor comparte su posición', () => {
  it('el cliente ve dónde viene su pedido, y el personal también', async () => {
    const { staff, cliente, idPedido, repartidor } = await pedidoEnCamino();

    await informar(repartidor.token).expect(204);

    const comoCliente = await seguirComoCliente(cliente.token, idPedido);
    const comoPersonal = await request(app)
      .get(`/api/gestion/pedidos/${idPedido}/seguimiento`)
      .set(cabecera(staff));

    for (const r of [comoCliente, comoPersonal]) {
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({
        enCamino: true,
        repartidor: 'Empleado',
        posicion: { latitud: PLAZA.latitud, longitud: PLAZA.longitud, precision: 12 },
      });
      expect(r.body.posicion.antiguedadSegundos).toBeLessThan(60);
    }
  });

  it('cada envío pisa al anterior: no se guarda el recorrido', async () => {
    const { cliente, idPedido, repartidor } = await pedidoEnCamino();

    await informar(repartidor.token).expect(204);
    await informar(repartidor.token, { latitud: -17.79, longitud: -63.19 }).expect(204);

    const r = await seguirComoCliente(cliente.token, idPedido);
    expect(r.body.posicion).toMatchObject({ latitud: -17.79, longitud: -63.19, precision: null });
  });

  it('antes de salir no se comparte nada: el pedido todavía está en el local', async () => {
    const { cliente, idPedido, repartidor } = await pedidoPorSalir();

    const envio = await informar(repartidor.token);
    const seguimiento = await seguirComoCliente(cliente.token, idPedido);

    expect(envio.status).toBe(409);
    expect(envio.body.error).toMatch(/pedido en camino/);
    expect(seguimiento.body).toEqual({ enCamino: false, repartidor: null, posicion: null });
  });

  it('al entregar, la posición se olvida', async () => {
    const { cliente, idPedido, repartidor } = await pedidoEnCamino();
    await informar(repartidor.token).expect(204);

    await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(repartidor.token))
      .send({ estado: 'Entregado' })
      .expect(200);

    const r = await seguirComoCliente(cliente.token, idPedido);
    expect(r.body).toEqual({ enCamino: false, repartidor: null, posicion: null });
    // Y ya no puede seguir enviándola: no lleva nada en la calle.
    expect((await informar(repartidor.token)).status).toBe(409);
  });

  it('puede dejar de compartir cuando quiera', async () => {
    const { cliente, idPedido, repartidor } = await pedidoEnCamino();
    await informar(repartidor.token).expect(204);

    await request(app).delete('/api/gestion/mi-posicion').set(cabecera(repartidor.token)).expect(204);

    const r = await seguirComoCliente(cliente.token, idPedido);
    expect(r.body).toMatchObject({ enCamino: true, posicion: null });
  });

  it('rechaza coordenadas fuera del mundo', async () => {
    const { repartidor } = await pedidoEnCamino();
    const r = await informar(repartidor.token, { latitud: 123, longitud: -63.18 });
    expect(r.status).toBe(400);
  });
});

describe('Seguimiento · quién puede ver qué', () => {
  it('otro cliente no ve el pedido ajeno: se responde como inexistente', async () => {
    const { idPedido, repartidor } = await pedidoEnCamino();
    await informar(repartidor.token).expect(204);
    const intruso = await registrarCliente();

    const r = await seguirComoCliente(intruso.token, idPedido);

    expect(r.status).toBe(404);
    expect(r.body.posicion).toBeUndefined();
  });

  it('un cliente no puede publicar una posición', async () => {
    const cliente = await registrarCliente();
    const r = await informar(cliente.token);
    expect(r.status).toBe(403);
  });

  it('un empleado sin entregas en la calle no puede publicar una', async () => {
    await pedidoEnCamino();
    const otro = await crearEmpleado('Repartidor');
    const r = await informar(otro.token);
    expect(r.status).toBe(409);
  });
});
