import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { obtenerToken, registrarCliente, buscarProducto } from './ayudantes.js';
import { invalidarCache } from '../src/services/configuracion.service.js';

/**
 * RF-PED-04 — Cobros.
 *
 * El sistema opera en modo Simulado: no se mueve dinero real. Lo que se
 * verifica aquí es que el **camino** sea el mismo que recorrerá el dinero de
 * verdad, porque el modo real no puede estrenarse sin haberse ejercitado.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

async function ventaConPago(token: string, metodoPago: string) {
  const producto = await buscarProducto('Barra de avena');
  return request(app)
    .post('/api/ventas')
    .set(cabecera(token))
    .send({ metodoPago, items: [{ idProducto: producto.id, cantidad: 1 }] });
}

async function pedidoConPago(tokenCliente: string, metodoPago: string) {
  const producto = await buscarProducto('Barra de avena');
  return request(app)
    .post('/api/pedidos')
    .set(cabecera(tokenCliente))
    .send({
      metodoPago,
      ubicacion: { calle: 'Avenida Banzer', numero: '1200', referencia: 'Puerta verde' },
      items: [{ idProducto: producto.id, cantidad: 1 }],
    });
}

// El modo se guarda en la base: si una prueba lo cambia, hay que devolverlo.
afterAll(async () => {
  const admin = await obtenerToken();
  await request(app)
    .put('/api/configuracion/cobro')
    .set(cabecera(admin))
    .send({ modo: 'Simulado' });
  invalidarCache();
});

describe('Modo de cobro', () => {
  it('el sistema nace en modo simulado', async () => {
    const admin = await obtenerToken();
    const r = await request(app).get('/api/configuracion/cobro').set(cabecera(admin));

    expect(r.status).toBe(200);
    expect(r.body.modo).toBe('Simulado');
    expect(r.body.pasarela).toBe('Simulada');
    expect(r.body.operativa).toBe(true);
  });

  it('un empleado no puede cambiar el modo de cobro', async () => {
    const cliente = await registrarCliente();
    const r = await request(app)
      .put('/api/configuracion/cobro')
      .set(cabecera(cliente.token))
      .send({ modo: 'Real' });

    expect(r.status).toBe(403);
  });

  /**
   * La comprobación que evita el peor escenario: activar el cobro real y que
   * toda venta en línea empiece a fallar recién frente a un cliente.
   */
  it('no permite activar el cobro real sin credenciales de la pasarela', async () => {
    const admin = await obtenerToken();
    const r = await request(app)
      .put('/api/configuracion/cobro')
      .set(cabecera(admin))
      .send({ modo: 'Real' });

    expect(r.status).toBe(409);
    // El mensaje nombra qué falta: decir solo «faltan credenciales» obliga a
    // adivinar cuál, y la que más se olvida —PAGO_URL_PUBLICA— ni siquiera lo
    // es, así que nadie la busca donde buscaría una credencial.
    expect(r.body.error).toContain('LIBELULA_API_KEY');
    expect(r.body.error).toContain('PAGO_URL_PUBLICA');

    // Y el modo no cambió.
    const estado = await request(app).get('/api/configuracion/cobro').set(cabecera(admin));
    expect(estado.body.modo).toBe('Simulado');
  });

  it('rechaza un modo que no existe', async () => {
    const admin = await obtenerToken();
    const r = await request(app)
      .put('/api/configuracion/cobro')
      .set(cabecera(admin))
      .send({ modo: 'Cripto' });

    expect(r.status).toBe(400);
  });
});

describe('Cobro de una venta', () => {
  it('el efectivo se cobra en el acto y queda registrado', async () => {
    const staff = await obtenerToken();
    const venta = await ventaConPago(staff, 'Efectivo');

    expect(venta.status).toBe(201);
    expect(venta.body.estadoPago).toBe('Pagado');
    expect(venta.body.cobro.estado).toBe('Pagado');
    expect(venta.body.cobro.pasarela).toBe('Mostrador');
    expect(venta.body.cobro.confirmadoEn).toBeTruthy();
    // El efectivo no genera QR: no hay nada que escanear.
    expect(venta.body.cobro.datosCobro).toBeNull();
  });

  it('el pago con QR abre un cobro y la venta queda pendiente', async () => {
    const staff = await obtenerToken();
    const venta = await ventaConPago(staff, 'QR');

    expect(venta.status).toBe(201);
    expect(venta.body.estadoPago).toBe('Pendiente');

    const cobro = venta.body.cobro;
    expect(cobro.estado).toBe('Pendiente');
    expect(cobro.simulado).toBe(true);
    expect(cobro.tipoDatos).toBe('qr');
    expect(cobro.referenciaExterna).toMatch(/^SIM-/);
    expect(cobro.expiraEn).toBeTruthy();
    // El monto viaja dentro del código: el cliente no lo teclea.
    expect(cobro.datosCobro).toContain(`monto=${Number(venta.body.total).toFixed(2)}`);
  });

  /**
   * El tipo lo declara la pasarela al abrir el cobro y desde entonces se
   * guarda. Antes se adivinaba mirando si el contenido empezaba por «http», y
   * como el texto de la pasarela simulada nunca empieza así, **todo** cobro
   * salía como QR: quien elegía Tarjeta recibía un código para escanear.
   */
  it('un cobro con Tarjeta no se dibuja como QR', async () => {
    const staff = await obtenerToken();
    const venta = await ventaConPago(staff, 'Tarjeta');

    expect(venta.status).toBe(201);
    const cobro = venta.body.cobro;
    expect(cobro.tipoDatos).toBe('url');
    // Y sin tipo `qr` no se genera la imagen, que era lo que se veía en pantalla.
    expect(cobro.qrImagen).toBeUndefined();
  });

  /**
   * El QR simulado tiene que ser reconocible como tal. Uno que pareciera
   * auténtico sería una forma involuntaria de estafa.
   */
  it('el código simulado avisa que no cobra dinero real', async () => {
    const staff = await obtenerToken();
    const venta = await ventaConPago(staff, 'QR');
    expect(venta.body.cobro.datosCobro).toContain('no cobra dinero real');
  });

  it('consultar el cobro lo confirma y arrastra a la venta', async () => {
    const staff = await obtenerToken();
    const venta = await ventaConPago(staff, 'QR');
    const idPago = venta.body.cobro.id;

    // Con retardo cero, la pasarela simulada ya lo da por pagado.
    const cobro = await request(app).get(`/api/pagos/${idPago}`).set(cabecera(staff));
    expect(cobro.status).toBe(200);
    expect(cobro.body.estado).toBe('Pagado');

    const detalle = await request(app)
      .get(`/api/ventas/${venta.body.id}`)
      .set(cabecera(staff));
    expect(detalle.body.estadoPago).toBe('Pagado');
  });

  /** Idempotencia: consultar dos veces no confirma dos veces. */
  it('consultar un cobro ya pagado no lo vuelve a confirmar', async () => {
    const staff = await obtenerToken();
    const venta = await ventaConPago(staff, 'QR');
    const idPago = venta.body.cobro.id;

    const primera = await request(app).get(`/api/pagos/${idPago}`).set(cabecera(staff));
    const segunda = await request(app).get(`/api/pagos/${idPago}`).set(cabecera(staff));

    expect(primera.body.estado).toBe('Pagado');
    expect(segunda.body.estado).toBe('Pagado');
    // La confirmación conserva su momento original: no se pisó.
    expect(segunda.body.confirmadoEn).toBe(primera.body.confirmadoEn);
  });

  it('un empleado puede confirmar a mano y queda constancia', async () => {
    const staff = await obtenerToken();
    const venta = await ventaConPago(staff, 'Tarjeta');
    const idPago = venta.body.cobro.id;

    const r = await request(app)
      .post(`/api/pagos/${idPago}/confirmar`)
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('Pagado');

    // Confirmarlo de nuevo se rechaza: ya tiene desenlace.
    const repetida = await request(app)
      .post(`/api/pagos/${idPago}/confirmar`)
      .set(cabecera(staff));
    expect(repetida.status).toBe(409);
  });

  it('anular un cobro no anula la venta, que puede reintentarse', async () => {
    const staff = await obtenerToken();
    const venta = await ventaConPago(staff, 'QR');

    const r = await request(app)
      .post(`/api/pagos/${venta.body.cobro.id}/anular`)
      .set(cabecera(staff));
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('Fallido');

    const detalle = await request(app)
      .get(`/api/ventas/${venta.body.id}`)
      .set(cabecera(staff));
    expect(detalle.body.estadoPago).toBe('Pendiente');
  });
});

describe('Cobro de un pedido', () => {
  /**
   * El QR se entregaba una sola vez, al confirmar. Quien cerrara la pestaña
   * antes de pagar perdía el código y no le quedaba más que esperar a que el
   * pedido venciera, con la comida reservada mientras tanto. El cobro siempre
   * estuvo en la base; lo que faltaba era devolverlo al consultar el pedido.
   */
  it('el cobro pendiente se recupera al volver a consultar el pedido', async () => {
    const cliente = await registrarCliente();
    const pedido = await pedidoConPago(cliente.token, 'QR');

    expect(pedido.status).toBe(201);
    expect(pedido.body.cobro.estado).toBe('Pendiente');

    const detalle = await request(app)
      .get(`/api/pedidos/${pedido.body.id}`)
      .set(cabecera(cliente.token));

    expect(detalle.status).toBe(200);
    expect(detalle.body.cobro).not.toBeNull();
    expect(detalle.body.cobro.id).toBe(pedido.body.cobro.id);
    expect(detalle.body.cobro.estado).toBe('Pendiente');
    // Lo que el cliente necesita para pagar: el contenido del código.
    expect(detalle.body.cobro.datosCobro).toBeTruthy();
  });

  it('al confirmarse el cobro, el pedido entra a la cola de preparación', async () => {
    const cliente = await registrarCliente();
    const pedido = await pedidoConPago(cliente.token, 'QR');

    expect(pedido.body.estadoPedido).toBe('Pendiente de pago');

    await request(app)
      .get(`/api/pagos/${pedido.body.cobro.id}`)
      .set(cabecera(cliente.token))
      .expect(200);

    const detalle = await request(app)
      .get(`/api/pedidos/${pedido.body.id}`)
      .set(cabecera(cliente.token));

    expect(detalle.body.estadoPedido).toBe('Recibido');
    expect(detalle.body.estadoPago).toBe('Pagado');
    // La referencia la puso la pasarela, no el cliente.
    expect(detalle.body.referenciaPago).toMatch(/^SIM-/);
  });

  /**
   * Sin esto, cada pedido abandonado en la pantalla de pago congelaría comida
   * en el inventario para siempre.
   */
  it('un cobro anulado cancela el pedido y devuelve el stock', async () => {
    const cliente = await registrarCliente();
    const staff = await obtenerToken();
    const antes = await buscarProducto('Barra de avena');

    const pedido = await pedidoConPago(cliente.token, 'QR');
    const durante = await buscarProducto('Barra de avena');
    expect(durante.stockDisponible).toBe(antes.stockDisponible - 1);

    await request(app)
      .post(`/api/pagos/${pedido.body.cobro.id}/anular`)
      .set(cabecera(staff))
      .expect(200);

    const detalle = await request(app)
      .get(`/api/pedidos/${pedido.body.id}`)
      .set(cabecera(cliente.token));
    expect(detalle.body.estadoPedido).toBe('Cancelado');
    expect(detalle.body.estadoPago).toBe('Vencido');
    // Y queda dicho por qué: no lo canceló el cliente ni el repartidor.
    expect(detalle.body.motivoCancelacion).toBe('Sin pago');

    const despues = await buscarProducto('Barra de avena');
    expect(despues.stockDisponible).toBe(antes.stockDisponible);
  });
});

describe('Aviso de la pasarela', () => {
  it('rechaza un aviso sin sesión ni firma válida', async () => {
    // En modo simulado nadie externo envía avisos, y un cobro inexistente no
    // se procesa. Lo importante es que la ruta no confirme nada por sí sola.
    const r = await request(app)
      .post('/api/pagos/notificacion')
      .set('Content-Type', 'application/json')
      .send({ idTransaccion: 'SIM-inventada', estado: 'Pagado', monto: 999 });

    expect(r.status).toBe(200);
    expect(r.body.procesado).toBe(false);
  });

  it('no confirma un cobro ajeno con un identificador adivinado', async () => {
    const staff = await obtenerToken();
    const venta = await ventaConPago(staff, 'QR');

    // Se envía un aviso con el identificador correcto pero un monto menor:
    // pagar Bs 1 por una venta de Bs 12 no la paga.
    const r = await request(app)
      .post('/api/pagos/notificacion')
      .set('Content-Type', 'application/json')
      .send({
        idTransaccion: venta.body.cobro.referenciaExterna,
        estado: 'Pagado',
        monto: 1,
      });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('monto');
  });
});

describe('El QR que llega a la pantalla', () => {
  /**
   * Una pasarela puede devolver dos cosas por `datosCobro`: el **texto** a
   * codificar, o el **código ya dibujado**.
   *
   * Confundirlas costó un fallo silencioso en producción: el adaptador de
   * Libélula empezó a devolver la imagen (`qr_simple_base64`, unos diez mil
   * caracteres) y el servicio intentó codificarla en un QR, que admite unos
   * 4.300. La librería lanzaba, el `catch` se lo tragaba, y la pantalla se
   * quedaba en «Preparando el cobro…» para siempre.
   */
  it('un texto corto se convierte en imagen de QR', async () => {
    const staff = await obtenerToken();
    const producto = await buscarProducto('Barra de avena');

    const venta = await request(app)
      .post('/api/ventas')
      .set(cabecera(staff))
      .send({ metodoPago: 'QR', items: [{ idProducto: producto.id, cantidad: 1 }] })
      .expect(201);

    const cobro = venta.body.cobro;
    expect(cobro.tipoDatos).toBe('qr');
    // La simulada devuelve texto; el servicio lo dibuja.
    expect(cobro.datosCobro).not.toMatch(/^data:image\//);
    expect(cobro.qrImagen).toMatch(/^data:image\/png;base64,/);
  });

  /**
   * Y el caso que fallaba: cuando `datosCobro` **ya es** una imagen, se pasa
   * tal cual en vez de intentar codificarla.
   */
  it('una imagen ya dibujada se entrega tal cual, sin recodificarla', async () => {
    const { conQRParaPruebas } = await import('../src/services/pago.service.js');

    const imagen = `data:image/png;base64,${'A'.repeat(9000)}`;
    const dto = await conQRParaPruebas({
      tipoDatos: 'qr',
      datosCobro: imagen,
    });

    expect(dto.qrImagen).toBe(imagen);
  });

  it('sin datos de cobro no se inventa una imagen', async () => {
    const { conQRParaPruebas } = await import('../src/services/pago.service.js');

    const dto = await conQRParaPruebas({ tipoDatos: null, datosCobro: null });
    expect(dto.qrImagen).toBeUndefined();
  });
});

/**
 * El plazo propio es de minutos; el del QR de la pasarela, de dias. Un cliente
 * que pagaba pasado ese cuarto de hora veia su pedido cancelado y el stock
 * devuelto **con el dinero ya cobrado**: el sistema miraba el reloj antes de
 * preguntar. Ahora pregunta primero, y el plazo solo decide cuando la pasarela
 * dice que no hubo pago.
 */
describe('Un cobro vencido que si se pago', () => {
  it('se da por pagado, no por vencido', async () => {
    const cliente = await registrarCliente();
    const pedido = await pedidoConPago(cliente.token, 'QR');
    const idPago = pedido.body.cobro.id as number;

    // Se atrasa el plazo a mano: es la unica forma de reproducir al cliente
    // que paga tarde sin esperar un cuarto de hora en la suite.
    await prisma.pago.update({
      where: { id_pago: idPago },
      data: { fecha_expiracion: new Date(Date.now() - 60_000) },
    });

    const r = await request(app)
      .get(`/api/pagos/${idPago}`)
      .set(cabecera(cliente.token));

    expect(r.status).toBe(200);
    // La pasarela simulada da el cobro por pagado en cuanto se le pregunta.
    expect(r.body.estado).toBe('Pagado');

    // Y el pedido entro a preparacion en vez de cancelarse.
    const detalle = await request(app)
      .get(`/api/pedidos/${pedido.body.id}`)
      .set(cabecera(cliente.token));
    expect(detalle.body.estadoPedido).toBe('Recibido');
    expect(detalle.body.estadoPago).toBe('Pagado');
  });

  /** El barrido automatico corre solo: con mas razon pregunta antes. */
  it('el barrido tampoco lo vence a ciegas', async () => {
    const cliente = await registrarCliente();
    const pedido = await pedidoConPago(cliente.token, 'QR');
    const idPago = pedido.body.cobro.id as number;

    await prisma.pago.update({
      where: { id_pago: idPago },
      data: { fecha_expiracion: new Date(Date.now() - 60_000) },
    });

    const admin = await obtenerToken();
    await request(app).post('/api/pagos/vencer').set(cabecera(admin)).expect(200);

    const r = await request(app).get(`/api/pagos/${idPago}`).set(cabecera(cliente.token));
    expect(r.body.estado).toBe('Pagado');
  });
});

/**
 * El aviso de la pasarela cierra el cobro identificandolo por la referencia.
 *
 * Libelula no devuelve su propio identificador en el aviso: repite el
 * `identificador_deuda` que le dimos, `PEDIDO-16`. Buscar el cobro solo por el
 * identificador de la pasarela no encontraba nada y el aviso se descartaba en
 * silencio, con el dinero ya cobrado.
 */
describe('Aviso que identifica el cobro por la referencia', () => {
  it('confirma el pedido aunque no traiga el identificador de la pasarela', async () => {
    const cliente = await registrarCliente();
    const pedido = await pedidoConPago(cliente.token, 'QR');
    const idPedido = pedido.body.id as number;

    const aviso = await request(app).get('/api/pagos/notificacion').query({
      testigo: 'en-modo-simulado-no-se-verifica',
      ref: `PEDIDO-${idPedido}`,
      estado: 'Pagado',
      monto: String(pedido.body.total),
    });

    expect(aviso.status).toBe(200);
    expect(aviso.body.procesado).toBe(true);

    const detalle = await request(app)
      .get(`/api/pedidos/${idPedido}`)
      .set(cabecera(cliente.token));
    expect(detalle.body.estadoPago).toBe('Pagado');
    expect(detalle.body.estadoPedido).toBe('Recibido');
  });

  /** Un aviso sobre algo que no existe no se inventa un cobro. */
  it('una referencia desconocida no confirma nada', async () => {
    const r = await request(app)
      .get('/api/pagos/notificacion')
      .query({ testigo: 'x', ref: 'PEDIDO-999999', estado: 'Pagado' });

    expect(r.status).toBe(200);
    expect(r.body.procesado).toBe(false);
  });
});
