import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  buscarProducto,
  crearEmpleado,
  obtenerToken,
  registrarCliente,
} from './ayudantes.js';
import { MensajeroSimulado, reiniciarMensajero } from '../src/correo/index.js';

/**
 * Avisos por correo (CU-PED-02, RF-PED-08).
 *
 * El mensajero simulado guarda en memoria lo que habría enviado, así que una
 * prueba puede afirmar "se le avisó al cliente" sin montar un servidor de
 * correo ni interceptar la red.
 *
 * Los avisos se disparan en segundo plano, de modo que hay que darle al bucle
 * de eventos la oportunidad de ejecutarlos antes de mirar el buzón.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Cede el turno para que los avisos en segundo plano alcancen a ejecutarse. */
const dejarCorrerLosAvisos = () => new Promise((r) => setTimeout(r, 50));

async function pedir(token: string) {
  const producto = await buscarProducto('Barra de avena');
  return request(app)
    .post('/api/pedidos')
    .set(cabecera(token))
    .send({
      metodoPago: 'Efectivo',
      ubicacion: { calle: 'Avenida Banzer', referencia: 'Portón verde' },
      items: [{ idProducto: producto.id, cantidad: 1 }],
    });
}

beforeEach(() => reiniciarMensajero());

describe('El aviso de confirmación dice cómo se paga', () => {
  it('a quien paga en efectivo le dice cuánto tener listo', async () => {
    const cliente = await registrarCliente();
    const pedido = await pedir(cliente.token);
    expect(pedido.status).toBe(201);
    const numero = String(pedido.body.id).padStart(5, '0');

    // Se espera **ese** correo y no un tiempo fijo: el aviso sale en segundo
    // plano, y uno que llega tarde caería en la prueba siguiente.
    await vi.waitFor(() =>
      expect(MensajeroSimulado.enviados.some((m) => m.asunto.includes(numero))).toBe(true),
    );
    const aviso = MensajeroSimulado.enviados.find((m) => m.asunto.includes(numero))!;
    expect(aviso.texto).toMatch(/Lo paga en efectivo al recibirlo: tenga listos Bs [\d.,]+/);
  });
});

describe('El sistema nace sin enviar correo de verdad', () => {
  it('usa el mensajero simulado por omisión', async () => {
    const { mensajero } = await import('../src/correo/index.js');
    expect(mensajero().enviaDeVerdad).toBe(false);
    expect(mensajero().nombre).toBe('Simulado');
  });
});

describe('Aviso al confirmar el pedido', () => {
  it('le escribe al cliente a su propio correo', async () => {
    const cliente = await registrarCliente();
    const pedido = await pedir(cliente.token);
    expect(pedido.status).toBe(201);

    await dejarCorrerLosAvisos();

    const aviso = MensajeroSimulado.enviados[0];
    expect(aviso).toBeDefined();
    expect(aviso.para).toEqual([`${cliente.nombreUsuario}@correo.bo`]);
    expect(aviso.asunto).toContain(String(pedido.body.id).padStart(5, '0'));
  });

  /** Quien lee el correo en texto plano tiene que entenderlo igual. */
  it('el aviso se entiende sin HTML', async () => {
    const cliente = await registrarCliente();
    await pedir(cliente.token);
    await dejarCorrerLosAvisos();

    const aviso = MensajeroSimulado.enviados[0];
    expect(aviso.texto).toContain('Recibimos su pedido');
    expect(aviso.texto).toContain('Bs');
    expect(aviso.html).toBeTruthy();
  });
});

describe('Aviso al avanzar el estado', () => {
  it('avisa en preparación, en camino y entregado', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const pedido = await pedir(cliente.token);

    await dejarCorrerLosAvisos();
    reiniciarMensajero();

    // CU-PED-02 exige repartidor antes de marcar el pedido en camino.
    const repartidor = await crearEmpleado('Repartidor');
    await request(app)
      .put(`/api/gestion/pedidos/${pedido.body.id}/repartidor`)
      .set(cabecera(staff))
      .send({ idRepartidor: repartidor.id })
      .expect(200);

    for (const estado of ['En preparacion', 'En camino', 'Entregado']) {
      await request(app)
        .patch(`/api/gestion/pedidos/${pedido.body.id}/estado`)
        .set(cabecera(staff))
        .send({ estado })
        .expect(200);
    }

    await dejarCorrerLosAvisos();

    const asuntos = MensajeroSimulado.enviados.map((m) => m.asunto);
    expect(asuntos).toHaveLength(3);
    expect(asuntos.some((a) => a.includes('preparando'))).toBe(true);
    expect(asuntos.some((a) => a.includes('camino'))).toBe(true);
    expect(asuntos.some((a) => a.includes('entregado'))).toBe(true);
  });

  it('cada aviso lleva el número del pedido', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const pedido = await pedir(cliente.token);

    await dejarCorrerLosAvisos();
    reiniciarMensajero();

    await request(app)
      .patch(`/api/gestion/pedidos/${pedido.body.id}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'En preparacion' });

    await dejarCorrerLosAvisos();

    const numero = `#${String(pedido.body.id).padStart(5, '0')}`;
    expect(MensajeroSimulado.enviados[0].asunto).toContain(numero);
  });
});

describe('Un aviso nunca rompe la operación', () => {
  /**
   * Es la regla que gobierna todo el módulo: el correo es un accesorio, no el
   * propósito. Si el envío falla, el pedido igual tiene que quedar registrado.
   */
  it('el pedido se registra aunque el correo falle', async () => {
    const cliente = await registrarCliente();

    // Se rompe el mensajero a propósito.
    const original = MensajeroSimulado.prototype.enviar;
    MensajeroSimulado.prototype.enviar = async () => {
      throw new Error('servidor de correo caído');
    };

    try {
      const pedido = await pedir(cliente.token);
      expect(pedido.status).toBe(201);
      await dejarCorrerLosAvisos();
    } finally {
      MensajeroSimulado.prototype.enviar = original;
    }
  });

  it('el estado avanza aunque el correo falle', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    const pedido = await pedir(cliente.token);
    await dejarCorrerLosAvisos();

    const original = MensajeroSimulado.prototype.enviar;
    MensajeroSimulado.prototype.enviar = async () => {
      throw new Error('servidor de correo caído');
    };

    try {
      const r = await request(app)
        .patch(`/api/gestion/pedidos/${pedido.body.id}/estado`)
        .set(cabecera(staff))
        .send({ estado: 'En preparacion' });

      expect(r.status).toBe(200);
      expect(r.body.estadoPedido).toBe('En preparacion');
    } finally {
      MensajeroSimulado.prototype.enviar = original;
    }
  });
});
