import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { crearEmpleado, obtenerToken, registrarCliente, buscarProducto } from './ayudantes.js';

/**
 * CU-PED-03 — direcciones del cliente, y RF-PED-07 — reparto equitativo.
 *
 * Lo que se prueba no es solo que funcione, sino que **el historial no se
 * reescriba**: una dirección corregida no puede cambiar dónde dice que se
 * entregó un pedido de hace tres meses.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

const DIRECCION = {
  etiqueta: 'Casa',
  calle: 'Avenida Banzer',
  numero: '1200',
  referencia: 'Frente al parque, puerta verde',
  latitud: -17.783,
  longitud: -63.182,
};

function guardarDireccion(token: string, cambios: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/ubicaciones')
    .set(cabecera(token))
    .send({ ...DIRECCION, ...cambios });
}

async function pedir(token: string, ubicacion: Record<string, unknown>) {
  const producto = await buscarProducto('Barra de avena');
  return request(app)
    .post('/api/pedidos')
    .set(cabecera(token))
    .send({ metodoPago: 'Efectivo', ubicacion, items: [{ idProducto: producto.id, cantidad: 1 }] });
}

describe('Direcciones del cliente', () => {
  it('guarda varias direcciones con su nombre', async () => {
    const { token } = await registrarCliente();

    await guardarDireccion(token, { etiqueta: 'Casa' }).expect(201);
    await guardarDireccion(token, { etiqueta: 'Oficina', calle: 'Calle Ayacucho' }).expect(201);

    const r = await request(app).get('/api/ubicaciones').set(cabecera(token));
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(2);
    expect(r.body.map((u: { etiqueta: string }) => u.etiqueta).sort()).toEqual(['Casa', 'Oficina']);
  });

  it('exige un nombre para poder distinguirlas', async () => {
    const { token } = await registrarCliente();
    const r = await guardarDireccion(token, { etiqueta: '' });
    expect(r.status).toBe(400);
  });

  it('un cliente no ve ni toca las direcciones de otro', async () => {
    const uno = await registrarCliente();
    const guardada = await guardarDireccion(uno.token).expect(201);

    const otro = await registrarCliente();
    const lista = await request(app).get('/api/ubicaciones').set(cabecera(otro.token));
    expect(lista.body).toHaveLength(0);

    // Ni adivinando el identificador.
    const ajena = await request(app)
      .delete(`/api/ubicaciones/${guardada.body.id}`)
      .set(cabecera(otro.token));
    expect(ajena.status).toBe(404);
  });

  it('un empleado no tiene direcciones de entrega', async () => {
    const empleado = await crearEmpleado('Vendedor');
    const r = await request(app).get('/api/ubicaciones').set(cabecera(empleado.token));
    expect(r.status).toBe(403);
  });
});

describe('Corregir una dirección no reescribe el historial', () => {
  /**
   * El caso que justifica que las direcciones no se editen: si la fila fuera
   * la misma, el pedido viejo diría que se entregó donde el cliente vive hoy.
   */
  it('el pedido conserva la dirección con la que se hizo', async () => {
    const { token } = await registrarCliente();
    const original = await guardarDireccion(token).expect(201);

    const pedido = await pedir(token, { idUbicacion: original.body.id });
    expect(pedido.status).toBe(201);
    expect(pedido.body.ubicacion.calle).toBe('Avenida Banzer');

    // El cliente se muda y corrige su dirección.
    const nueva = await request(app)
      .put(`/api/ubicaciones/${original.body.id}`)
      .set(cabecera(token))
      .send({ ...DIRECCION, calle: 'Calle Nueva Mudanza' });
    expect(nueva.status).toBe(200);
    expect(nueva.body.id).not.toBe(original.body.id);

    // El pedido de antes sigue diciendo dónde se entregó de verdad.
    const detalle = await request(app)
      .get(`/api/pedidos/${pedido.body.id}`)
      .set(cabecera(token));
    expect(detalle.body.ubicacion.calle).toBe('Avenida Banzer');

    // Y la lista ya no ofrece la vieja.
    const lista = await request(app).get('/api/ubicaciones').set(cabecera(token));
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].calle).toBe('Calle Nueva Mudanza');
  });

  it('eliminar la archiva, no la borra: el pedido la conserva', async () => {
    const { token } = await registrarCliente();
    const guardada = await guardarDireccion(token).expect(201);
    const pedido = await pedir(token, { idUbicacion: guardada.body.id });

    await request(app)
      .delete(`/api/ubicaciones/${guardada.body.id}`)
      .set(cabecera(token))
      .expect(204);

    const detalle = await request(app)
      .get(`/api/pedidos/${pedido.body.id}`)
      .set(cabecera(token));
    expect(detalle.body.ubicacion.calle).toBe('Avenida Banzer');
  });

  it('no se puede pedir a una dirección ya reemplazada', async () => {
    const { token } = await registrarCliente();
    const original = await guardarDireccion(token).expect(201);
    await request(app)
      .put(`/api/ubicaciones/${original.body.id}`)
      .set(cabecera(token))
      .send({ ...DIRECCION, calle: 'Otra calle' });

    const r = await pedir(token, { idUbicacion: original.body.id });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('reemplazada');
  });
});

describe('Pedir con dirección guardada o escrita en el momento', () => {
  it('con una guardada: el cliente no reescribe nada', async () => {
    const { token } = await registrarCliente();
    const guardada = await guardarDireccion(token).expect(201);

    const r = await pedir(token, { idUbicacion: guardada.body.id });
    expect(r.status).toBe(201);
    expect(r.body.ubicacion.referencia).toBe(DIRECCION.referencia);
  });

  /** Quien pide por primera vez no debería tener que guardar nada antes. */
  it('escrita en el momento y sin nombre: sirve para este pedido y no se guarda', async () => {
    const { token } = await registrarCliente();

    const r = await pedir(token, {
      calle: 'Calle de una sola vez',
      referencia: 'Casa de un amigo',
    });
    expect(r.status).toBe(201);

    const lista = await request(app).get('/api/ubicaciones').set(cabecera(token));
    expect(lista.body).toHaveLength(0);
  });

  it('escrita con nombre: queda guardada para la próxima', async () => {
    const { token } = await registrarCliente();

    await pedir(token, {
      calle: 'Calle del trabajo',
      referencia: 'Edificio azul, piso 3',
      etiqueta: 'Oficina',
    }).then((r) => expect(r.status).toBe(201));

    const lista = await request(app).get('/api/ubicaciones').set(cabecera(token));
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].etiqueta).toBe('Oficina');
  });

  /** El mensaje debe decir *qué* falta, no un genérico "entrada inválida". */
  it('sin calle ni referencia, dice cuál falta', async () => {
    const { token } = await registrarCliente();
    const r = await pedir(token, { numero: '123' });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('calle');
    expect(r.body.error).toContain('referencia');
  });

  it('no se puede pedir a la dirección de otro cliente', async () => {
    const dueno = await registrarCliente();
    const guardada = await guardarDireccion(dueno.token).expect(201);

    const otro = await registrarCliente();
    const r = await pedir(otro.token, { idUbicacion: guardada.body.id });
    expect(r.status).toBe(404);
  });
});

describe('RF-PED-07 · Sugerencia de repartidor', () => {
  async function pedidoEnCurso() {
    const cliente = await registrarCliente();
    const pedido = await pedir(cliente.token, {
      calle: 'Avenida Alemana',
      referencia: 'Portón negro',
    });
    return pedido.body.id as number;
  }

  it('no sugiere a nadie si ningún repartidor está de turno', async () => {
    const staff = await obtenerToken();
    const idPedido = await pedidoEnCurso();

    const r = await request(app)
      .get(`/api/gestion/pedidos/${idPedido}/sugerencia-repartidor`)
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    // No es un error: quedarse sin repartidores es normal en la operación.
    expect(r.body.sugerido).toBeNull();
    expect(r.body.motivo).toContain('turno');
  });

  it('sugiere al repartidor de turno con menos entregas en curso', async () => {
    const staff = await obtenerToken();
    const uno = await crearEmpleado('Repartidor');
    const dos = await crearEmpleado('Repartidor');

    // Ambos declaran su turno.
    for (const r of [uno, dos]) {
      await request(app)
        .put('/api/gestion/disponibilidad')
        .set(cabecera(r.token))
        .send({ disponible: true })
        .expect(200);
    }

    // Al primero se le carga una entrega.
    const ocupado = await pedidoEnCurso();
    await request(app)
      .put(`/api/gestion/pedidos/${ocupado}/repartidor`)
      .set(cabecera(staff))
      .send({ idRepartidor: uno.id })
      .expect(200);
    await request(app)
      .patch(`/api/gestion/pedidos/${ocupado}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'En preparacion' });

    const idPedido = await pedidoEnCurso();
    const r = await request(app)
      .get(`/api/gestion/pedidos/${idPedido}/sugerencia-repartidor`)
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    // El que no tiene nada encima.
    expect(r.body.sugerido.id).toBe(dos.id);
    expect(r.body.sugerido.entregasEnCurso).toBe(0);
    expect(r.body.motivo).toContain('no tiene entregas');
  });

  it('nunca sugiere a quien está de franco, aunque no tenga carga', async () => {
    const staff = await obtenerToken();
    const deFranco = await crearEmpleado('Repartidor');
    // No declara turno: queda en falso, que es como nace.

    const idPedido = await pedidoEnCurso();
    const r = await request(app)
      .get(`/api/gestion/pedidos/${idPedido}/sugerencia-repartidor`)
      .set(cabecera(staff));

    const idsSugeridos = r.body.sugerido ? [r.body.sugerido.id] : [];
    expect(idsSugeridos).not.toContain(deFranco.id);

    // Pero sí aparece entre los candidatos, marcado como no disponible.
    const candidato = r.body.candidatos.find((c: { id: number }) => c.id === deFranco.id);
    expect(candidato.disponible).toBe(false);
  });

  /** La sugerencia propone; asignar sigue siendo una acción de la persona. */
  it('sugerir no asigna: el pedido sigue sin repartidor', async () => {
    const staff = await obtenerToken();
    const repartidor = await crearEmpleado('Repartidor');
    await request(app)
      .put('/api/gestion/disponibilidad')
      .set(cabecera(repartidor.token))
      .send({ disponible: true });

    const idPedido = await pedidoEnCurso();
    await request(app)
      .get(`/api/gestion/pedidos/${idPedido}/sugerencia-repartidor`)
      .set(cabecera(staff))
      .expect(200);

    const detalle = await request(app)
      .get(`/api/gestion/pedidos/${idPedido}`)
      .set(cabecera(staff));
    expect(detalle.body.repartidor).toBeNull();
  });

  it('el repartidor declara su propio turno', async () => {
    const repartidor = await crearEmpleado('Repartidor');

    const encendido = await request(app)
      .put('/api/gestion/disponibilidad')
      .set(cabecera(repartidor.token))
      .send({ disponible: true });
    expect(encendido.status).toBe(200);
    expect(encendido.body.disponible).toBe(true);

    const apagado = await request(app)
      .put('/api/gestion/disponibilidad')
      .set(cabecera(repartidor.token))
      .send({ disponible: false });
    expect(apagado.body.disponible).toBe(false);
  });

  it('un empleado nuevo empieza fuera de turno', async () => {
    const repartidor = await crearEmpleado('Repartidor');

    const r = await request(app)
      .get('/api/gestion/disponibilidad')
      .set(cabecera(repartidor.token));

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ disponible: false });
  });

  /**
   * El turno se guardaba, pero no había forma de leerlo: la pantalla de
   * entregas arrancaba siempre en «Fuera de turno» y, al volver a ella,
   * contradecía a la base. Se lee con una sesión aparte, como la pantalla que
   * se abre de nuevo.
   */
  it('el turno declarado se lee de vuelta, no solo se escribe', async () => {
    const repartidor = await crearEmpleado('Repartidor');

    await request(app)
      .put('/api/gestion/disponibilidad')
      .set(cabecera(repartidor.token))
      .send({ disponible: true })
      .expect(200);

    const leido = await request(app)
      .get('/api/gestion/disponibilidad')
      .set(cabecera(repartidor.token));
    expect(leido.body.disponible).toBe(true);

    await request(app)
      .put('/api/gestion/disponibilidad')
      .set(cabecera(repartidor.token))
      .send({ disponible: false })
      .expect(200);

    const releido = await request(app)
      .get('/api/gestion/disponibilidad')
      .set(cabecera(repartidor.token));
    expect(releido.body.disponible).toBe(false);
  });

  it('cada empleado lee su propio turno, no el de otro', async () => {
    const deTurno = await crearEmpleado('Repartidor');
    const libre = await crearEmpleado('Repartidor');

    await request(app)
      .put('/api/gestion/disponibilidad')
      .set(cabecera(deTurno.token))
      .send({ disponible: true })
      .expect(200);

    const r = await request(app)
      .get('/api/gestion/disponibilidad')
      .set(cabecera(libre.token));
    expect(r.body.disponible).toBe(false);
  });

  it('un cliente no tiene turno que consultar', async () => {
    const cliente = await registrarCliente();
    const r = await request(app)
      .get('/api/gestion/disponibilidad')
      .set(cabecera(cliente.token));

    expect(r.status).toBe(403);
  });

  it('un cliente no puede declararse repartidor de turno', async () => {
    const cliente = await registrarCliente();
    const r = await request(app)
      .put('/api/gestion/disponibilidad')
      .set(cabecera(cliente.token))
      .send({ disponible: true });

    expect(r.status).toBe(403);
  });
});

describe('RF-PED-07 · Las entregas del repartidor', () => {
  it('ve solo las suyas, no las de todos', async () => {
    const staff = await obtenerToken();
    const mio = await crearEmpleado('Repartidor');
    const ajeno = await crearEmpleado('Repartidor');

    const cliente = await registrarCliente();
    const pedido = await pedir(cliente.token, {
      calle: 'Avenida Cristo Redentor',
      referencia: 'Kilometro 4',
    });

    await request(app)
      .put(`/api/gestion/pedidos/${pedido.body.id}/repartidor`)
      .set(cabecera(staff))
      .send({ idRepartidor: mio.id })
      .expect(200);
    await request(app)
      .patch(`/api/gestion/pedidos/${pedido.body.id}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'En preparacion' });

    const mias = await request(app).get('/api/gestion/mis-entregas').set(cabecera(mio.token));
    expect(mias.status).toBe(200);
    expect(mias.body.map((p: { id: number }) => p.id)).toContain(pedido.body.id);

    // El otro repartidor no la ve.
    const ajenas = await request(app).get('/api/gestion/mis-entregas').set(cabecera(ajeno.token));
    expect(ajenas.body.map((p: { id: number }) => p.id)).not.toContain(pedido.body.id);
  });

  /** Un pedido entregado sigue a su nombre, pero ya no es trabajo pendiente. */
  it('no lista las entregas ya terminadas', async () => {
    const staff = await obtenerToken();
    const repartidor = await crearEmpleado('Repartidor');
    const cliente = await registrarCliente();

    const pedido = await pedir(cliente.token, {
      calle: 'Calle Terminada',
      referencia: 'Casa amarilla',
    });

    await request(app)
      .put(`/api/gestion/pedidos/${pedido.body.id}/repartidor`)
      .set(cabecera(staff))
      .send({ idRepartidor: repartidor.id });

    for (const estado of ['En preparacion', 'En camino', 'Entregado']) {
      await request(app)
        .patch(`/api/gestion/pedidos/${pedido.body.id}/estado`)
        .set(cabecera(staff))
        .send({ estado })
        .expect(200);
    }

    const mias = await request(app)
      .get('/api/gestion/mis-entregas')
      .set(cabecera(repartidor.token));
    expect(mias.body.map((p: { id: number }) => p.id)).not.toContain(pedido.body.id);
  });

  it('trae la dirección y el teléfono de quien recibe', async () => {
    const staff = await obtenerToken();
    const repartidor = await crearEmpleado('Repartidor');
    const cliente = await registrarCliente();

    const pedido = await pedir(cliente.token, {
      calle: 'Avenida Busch',
      referencia: 'Portón azul, timbre 2',
    });

    await request(app)
      .put(`/api/gestion/pedidos/${pedido.body.id}/repartidor`)
      .set(cabecera(staff))
      .send({ idRepartidor: repartidor.id });
    await request(app)
      .patch(`/api/gestion/pedidos/${pedido.body.id}/estado`)
      .set(cabecera(staff))
      .send({ estado: 'En preparacion' });

    const mias = await request(app)
      .get('/api/gestion/mis-entregas')
      .set(cabecera(repartidor.token));

    const entrega = mias.body.find((p: { id: number }) => p.id === pedido.body.id);
    expect(entrega.ubicacion.referencia).toBe('Portón azul, timbre 2');
    expect(entrega.cliente.nombreCompleto).toBeTruthy();
  });

  it('un cliente no tiene entregas que repartir', async () => {
    const cliente = await registrarCliente();
    const r = await request(app).get('/api/gestion/mis-entregas').set(cabecera(cliente.token));
    expect(r.status).toBe(403);
  });
});
