import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  obtenerToken,
  registrarCliente,
  crearEmpleado,
  crearPedido,
  buscarProducto,
} from './ayudantes.js';
import { MensajeroSimulado, reiniciarMensajero } from '../src/correo/index.js';

/**
 * CU-PED-02 — Gestionar Pedido, lado del empleado.
 * Cubre RF-PED-07 (asignar repartidor) y RF-PED-08 (flujo de estados).
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Deja un pedido listo para repartir: en preparación y con repartidor asignado. */
async function pedidoConRepartidor(tokenStaff: string) {
  const cliente = await registrarCliente();
  const idPedido = await crearPedido(cliente.token, 'Jugo verde');
  const repartidor = await crearEmpleado('Repartidor');

  await request(app)
    .patch(`/api/gestion/pedidos/${idPedido}/estado`)
    .set(cabecera(tokenStaff))
    .send({ estado: 'En preparacion' })
    .expect(200);

  await request(app)
    .put(`/api/gestion/pedidos/${idPedido}/repartidor`)
    .set(cabecera(tokenStaff))
    .send({ idRepartidor: repartidor.id })
    .expect(200);

  return { idPedido, repartidor };
}

describe('CU-PED-02 Tablero del personal', () => {
  it('el personal ve pedidos de clientes distintos', async () => {
    const staff = await obtenerToken();
    const primero = await registrarCliente();
    const segundo = await registrarCliente();

    await crearPedido(primero.token, 'Limonada');
    await crearPedido(segundo.token, 'Limonada');

    const r = await request(app).get('/api/gestion/pedidos').set(cabecera(staff));

    expect(r.status).toBe(200);
    const idsCliente = new Set(
      r.body.datos.map((p: { cliente: { id: number } }) => p.cliente.id),
    );
    expect(idsCliente.size).toBeGreaterThanOrEqual(2);
  });

  it('el detalle incluye el cliente, su teléfono y las transiciones posibles', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Limonada');

    const r = await request(app).get(`/api/gestion/pedidos/${idPedido}`).set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.cliente.nombreCompleto).toContain('Cliente');
    expect(r.body.cliente).toHaveProperty('telefono');
    expect(r.body.repartidor).toBeNull();
    expect(r.body.transicionesPosibles).toEqual(['En preparacion']);
    expect(r.body.ubicacion.calle).toBe('Avenida Banzer');
  });

  it('filtra por estado', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Limonada');

    await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'En preparacion' })
      .expect(200);

    const r = await request(app)
      .get('/api/gestion/pedidos')
      .query({ estado: 'En preparacion' })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.datos.length).toBeGreaterThan(0);
    for (const pedido of r.body.datos) {
      expect(pedido.estadoPedido).toBe('En preparacion');
    }
  });

  it('rechaza un estado fuera del vocabulario del esquema', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/gestion/pedidos')
      .query({ estado: 'Inventado' })
      .set(cabecera(staff));

    expect(r.status).toBe(400);
  });

  it('un cliente no puede entrar al tablero del personal', async () => {
    const cliente = await registrarCliente();

    const r = await request(app).get('/api/gestion/pedidos').set(cabecera(cliente.token));

    expect(r.status).toBe(403);
    expect(r.body.error).toContain('personal interno');
  });

  it('exige sesión iniciada', async () => {
    const r = await request(app).get('/api/gestion/pedidos');
    expect(r.status).toBe(401);
  });

  it('responde 404 por un pedido inexistente', async () => {
    const staff = await obtenerToken();
    const r = await request(app).get('/api/gestion/pedidos/999999').set(cabecera(staff));
    expect(r.status).toBe(404);
  });
});

describe('RF-PED-08 Flujo de estados del pedido', () => {
  it('avanza de Recibido a En preparación', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Ensalada Cesar');

    const r = await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'En preparacion' });

    expect(r.status).toBe(200);
    expect(r.body.estadoPedido).toBe('En preparacion');
    expect(r.body.transicionesPosibles).toEqual(['En camino']);
  });

  it('no permite saltarse etapas del flujo', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Ensalada Cesar');

    const r = await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'Entregado' });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('desde Recibido solo puede pasar a En preparacion');
  });

  it('no permite retroceder', async () => {
    const staff = await obtenerToken();
    const { idPedido } = await pedidoConRepartidor(staff);

    const r = await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'Recibido' });

    expect(r.status).toBe(409);
  });

  it('impide marcar En camino sin repartidor asignado', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Ensalada mediterranea');

    await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'En preparacion' })
      .expect(200);

    const r = await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'En camino' });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Asigne un repartidor');
  });

  it('completa el ciclo y sella la fecha de entrega', async () => {
    const staff = await obtenerToken();
    const { idPedido } = await pedidoConRepartidor(staff);

    const enCamino = await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'En camino' });

    expect(enCamino.status).toBe(200);
    expect(enCamino.body.fechaEntrega).toBeNull();

    const entregado = await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'Entregado' });

    expect(entregado.status).toBe(200);
    expect(entregado.body.estadoPedido).toBe('Entregado');
    expect(entregado.body.fechaEntrega).not.toBeNull();
    expect(entregado.body.transicionesPosibles).toEqual([]);
  });

  it('un pedido entregado ya no admite cambios', async () => {
    const staff = await obtenerToken();
    const { idPedido } = await pedidoConRepartidor(staff);

    for (const estado of ['En camino', 'Entregado']) {
      await request(app)
        .patch(`/api/gestion/pedidos/${idPedido}/estado`)
        .set(cabecera(staff))
        .send({ estado })
        .expect(200);
    }

    const r = await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'En camino' });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('ya no admite cambios');
  });

  it('un pedido cancelado por el cliente no puede avanzar', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Wrap integral');

    await request(app)
      .post(`/api/pedidos/${idPedido}/cancelar`)
      .set(cabecera(cliente.token))
      .expect(200);

    const r = await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'En preparacion' });

    expect(r.status).toBe(409);
  });

  it('rechaza un estado que no existe en el esquema', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Wrap integral');

    const r = await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'Despachado' });

    expect(r.status).toBe(400);
  });

  it('un cliente no puede cambiar el estado de su propio pedido', async () => {
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Wrap integral');

    const r = await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(cliente.token))
      .send({ estado: 'En preparacion' });

    expect(r.status).toBe(403);
  });
});

describe('RF-PED-07 Asignación de repartidor', () => {
  it('lista únicamente al personal con cargo Repartidor', async () => {
    const staff = await obtenerToken();
    const repartidor = await crearEmpleado('Repartidor');
    const cocinero = await crearEmpleado('Cocinero');

    const r = await request(app).get('/api/gestion/repartidores').set(cabecera(staff));

    expect(r.status).toBe(200);
    const ids = r.body.map((x: { id: number }) => x.id);
    expect(ids).toContain(repartidor.id);
    expect(ids).not.toContain(cocinero.id);
  });

  it('asigna un repartidor y lo devuelve en el detalle', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Bowl de quinua');
    const repartidor = await crearEmpleado('Repartidor');

    const r = await request(app)
      .put(`/api/gestion/pedidos/${idPedido}/repartidor`)
      .set(cabecera(staff))
      .send({ idRepartidor: repartidor.id });

    expect(r.status).toBe(200);
    expect(r.body.repartidor.id).toBe(repartidor.id);
  });

  it('rechaza a un empleado que no es repartidor e informa su cargo', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Bowl de quinua');
    const cocinero = await crearEmpleado('Cocinero');

    const r = await request(app)
      .put(`/api/gestion/pedidos/${idPedido}/repartidor`)
      .set(cabecera(staff))
      .send({ idRepartidor: cocinero.id });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('cargo Cocinero');
  });

  it('rechaza a un empleado inexistente', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Bowl de quinua');

    const r = await request(app)
      .put(`/api/gestion/pedidos/${idPedido}/repartidor`)
      .set(cabecera(staff))
      .send({ idRepartidor: 999999 });

    expect(r.status).toBe(404);
  });

  it('no asigna repartidor a un pedido ya entregado', async () => {
    const staff = await obtenerToken();
    const { idPedido } = await pedidoConRepartidor(staff);
    const otro = await crearEmpleado('Repartidor');

    for (const estado of ['En camino', 'Entregado']) {
      await request(app)
        .patch(`/api/gestion/pedidos/${idPedido}/estado`)
        .set(cabecera(staff))
        .send({ estado })
        .expect(200);
    }

    const r = await request(app)
      .put(`/api/gestion/pedidos/${idPedido}/repartidor`)
      .set(cabecera(staff))
      .send({ idRepartidor: otro.id });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Entregado');
  });

  it('un cliente no puede asignar repartidores', async () => {
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Bowl de quinua');
    const repartidor = await crearEmpleado('Repartidor');

    const r = await request(app)
      .put(`/api/gestion/pedidos/${idPedido}/repartidor`)
      .set(cabecera(cliente.token))
      .send({ idRepartidor: repartidor.id });

    expect(r.status).toBe(403);
  });
});

/**
 * CU-PED-02 — quién cierra la entrega, y qué arrastra cerrarla.
 *
 * Marcar «Entregado» dejó de ser un cambio de estado: en un pedido en efectivo
 * es la afirmación de que el repartidor recibió el dinero. Por eso solo puede
 * hacerlo quien estuvo en la puerta, y por eso el cobro se cierra con el
 * pedido y no por separado.
 */
describe('CU-PED-02 · Cerrar la entrega', () => {
  /** Deja el pedido en la calle, con su repartidor asignado. */
  async function pedidoEnCamino() {
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
    await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'En camino' })
      .expect(200);

    return { staff, cliente, idPedido, repartidor };
  }

  const cerrar = (token: string, idPedido: number, estado: string) =>
    request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(token))
      .send({ estado });

  it('un empleado que no es el repartidor asignado no puede marcarla entregada', async () => {
    const { idPedido } = await pedidoEnCamino();
    const otro = await crearEmpleado('Vendedor');

    const r = await cerrar(otro.token, idPedido, 'Entregado');

    expect(r.status).toBe(403);
    expect(r.body.error).toContain('repartidor asignado');
  });

  it('el repartidor asignado la entrega, y el pedido en efectivo queda cobrado', async () => {
    const { cliente, idPedido, repartidor } = await pedidoEnCamino();

    const r = await cerrar(repartidor.token, idPedido, 'Entregado');
    expect(r.status).toBe(200);
    expect(r.body.estadoPedido).toBe('Entregado');
    expect(r.body.estadoPago).toBe('Pagado');

    // Y el cobro, que nació pendiente, se cerró con la entrega.
    const detalle = await request(app)
      .get(`/api/pedidos/${idPedido}`)
      .set(cabecera(cliente.token));
    expect(detalle.body.cobro.estado).toBe('Pagado');
  });

  /** La llave para destrabar un pedido cuyo repartidor no aparece. */
  it('el administrador puede cerrar una entrega ajena', async () => {
    const { staff, idPedido } = await pedidoEnCamino();

    const r = await cerrar(staff, idPedido, 'Entregado');
    expect(r.status).toBe(200);
    expect(r.body.estadoPedido).toBe('Entregado');
  });

  it('nadie en la puerta: el repartidor lo da por no entregado y la comida vuelve', async () => {
    const { cliente, idPedido, repartidor } = await pedidoEnCamino();
    const antes = await buscarProducto('Jugo verde');

    const r = await cerrar(repartidor.token, idPedido, 'Cancelado');
    expect(r.status).toBe(200);
    expect(r.body.estadoPedido).toBe('Cancelado');

    // El producto terminado vuelve al inventario, listo para venderse.
    const despues = await buscarProducto('Jugo verde');
    expect(despues.stockDisponible).toBe(antes.stockDisponible + 1);

    // Y el cobro se cierra como fallido: nunca se cobró.
    const detalle = await request(app)
      .get(`/api/pedidos/${idPedido}`)
      .set(cabecera(cliente.token));
    expect(detalle.body.cobro.estado).toBe('Fallido');
    expect(detalle.body.estadoPago).toBe('Pendiente');
  });

  it('un empleado ajeno tampoco puede darla por no entregada', async () => {
    const { idPedido } = await pedidoEnCamino();
    const otro = await crearEmpleado('Cocinero');

    const r = await cerrar(otro.token, idPedido, 'Cancelado');
    expect(r.status).toBe(403);
  });

  /** C3: el efectivo de un pedido se cobra en la puerta, no al confirmarlo. */
  it('el cobro en efectivo de un pedido nace pendiente, no pagado', async () => {
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Limonada');

    const r = await request(app)
      .get(`/api/pedidos/${idPedido}`)
      .set(cabecera(cliente.token));

    expect(r.body.cobro.estado).toBe('Pendiente');
    expect(r.body.estadoPago).toBe('Pendiente');
  });
});

/*
 * Lo que encontró el recorrido de un pedido en efectivo: "Cancelado" a secas
 * no decía si lo anuló el cliente o si el repartidor no pudo entregarlo, y al
 * cliente le llegaba "Su pedido fue cancelado" por algo que él no hizo.
 */
describe('CU-PED-02 · Por qué se canceló y qué se le dice al cliente', () => {
  /** Espera a que llegue un aviso cuyo asunto contenga el texto, sin adivinar un plazo. */
  const esperarAviso = (texto: string) =>
    vi.waitFor(() =>
      expect(MensajeroSimulado.enviados.some((m) => m.asunto.includes(texto))).toBe(true),
    );

  beforeEach(() => reiniciarMensajero());

  async function enCamino() {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Jugo verde');
    const repartidor = await crearEmpleado('Repartidor');
    for (const paso of [
      () => request(app).patch(`/api/gestion/pedidos/${idPedido}/estado`).set(cabecera(staff)).send({ estado: 'En preparacion' }),
      () => request(app).put(`/api/gestion/pedidos/${idPedido}/repartidor`).set(cabecera(staff)).send({ idRepartidor: repartidor.id }),
      () => request(app).patch(`/api/gestion/pedidos/${idPedido}/estado`).set(cabecera(staff)).send({ estado: 'En camino' }),
    ]) {
      await paso().expect(200);
    }
    return { cliente, idPedido, repartidor };
  }

  const detalle = (token: string, idPedido: number) =>
    request(app).get(`/api/pedidos/${idPedido}`).set(cabecera(token));

  it('un pedido no entregado lo dice así, y no como una cancelación del cliente', async () => {
    const { cliente, idPedido, repartidor } = await enCamino();
    reiniciarMensajero();

    await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(repartidor.token))
      .send({ estado: 'Cancelado' })
      .expect(200);
    await esperarAviso('No pudimos entregar');

    expect((await detalle(cliente.token, idPedido)).body.motivoCancelacion).toBe('No entregado');

    const aviso = MensajeroSimulado.enviados[0];
    expect(aviso.asunto).toContain('No pudimos entregar su pedido');
    // En efectivo no hubo cobro: no se le habla de reembolsos.
    expect(aviso.texto).toContain('No se le cobró nada');
    expect(aviso.texto).not.toContain('reembolso');
  });

  it('un pedido que cancela el cliente guarda que fue él', async () => {
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Jugo verde');

    await request(app)
      .post(`/api/pedidos/${idPedido}/cancelar`)
      .set(cabecera(cliente.token))
      .expect(200);

    expect((await detalle(cliente.token, idPedido)).body.motivoCancelacion).toBe('Cliente');
  });

  it('un pedido que sigue su curso no tiene motivo de cancelación', async () => {
    const cliente = await registrarCliente();
    const idPedido = await crearPedido(cliente.token, 'Jugo verde');

    expect((await detalle(cliente.token, idPedido)).body.motivoCancelacion).toBeNull();
  });

  it('en efectivo, el aviso de salida recuerda cuánto tener listo y el de entrega, cuánto pagó', async () => {
    const { idPedido, repartidor } = await enCamino();
    await esperarAviso('en camino');

    const enCaminoAviso = MensajeroSimulado.enviados.find((m) => m.asunto.includes('en camino'))!;
    expect(enCaminoAviso.texto).toMatch(/Tenga listos Bs [\d.,]+ para pagarle al repartidor/);

    reiniciarMensajero();
    await request(app)
      .patch(`/api/gestion/pedidos/${idPedido}/estado`)
      .set(cabecera(repartidor.token))
      .send({ estado: 'Entregado' })
      .expect(200);
    await esperarAviso('entregado');

    const entrega = MensajeroSimulado.enviados[0];
    expect(entrega.asunto).toContain('entregado');
    expect(entrega.texto).toMatch(/Pagó Bs [\d.,]+ en efectivo/);
    // Antes decía "figura como entregado", que suena a duda.
    expect(entrega.texto).not.toContain('figura como');
  });
});
