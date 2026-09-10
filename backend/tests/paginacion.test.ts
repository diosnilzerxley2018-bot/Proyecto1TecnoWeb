import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { buscarProducto, crearPedido, obtenerToken, registrarCliente } from './ayudantes.js';
import { POR_PAGINA_MAXIMO, POR_PAGINA_POR_OMISION } from '../src/dtos/paginacion.dto.js';

/**
 * Hallazgo H7 — los listados no tenían paginación ni filtro por fecha.
 *
 * Cada uno traía su tabla entera: con miles de ventas, el historial las
 * cargaba todas para mostrar veinte. Lo que se comprueba aquí es que el
 * contrato sea **uno solo** para todos, que el tope lo imponga el servidor y
 * que el total no se confunda con lo que trae la página.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Los seis listados que crecen sin techo mientras el negocio funciona. */
const LISTADOS = [
  '/api/ventas',
  '/api/gestion/pedidos',
  '/api/ingresos',
  '/api/egresos',
  '/api/ordenes',
  '/api/clientes',
  '/api/usuarios',
];

function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('Contrato de paginación', () => {
  it.each(LISTADOS)('%s responde una página, no un arreglo', async (ruta) => {
    const staff = await obtenerToken();
    const r = await request(app).get(ruta).set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(false);
    expect(Array.isArray(r.body.datos)).toBe(true);
    expect(r.body).toMatchObject({
      pagina: 1,
      porPagina: POR_PAGINA_POR_OMISION,
      total: expect.any(Number),
      paginas: expect.any(Number),
    });
  });

  /** Sin tope, `?porPagina=999999` devuelve la tabla y la paginación no protege nada. */
  it.each(LISTADOS)('%s rechaza pedir más del máximo por página', async (ruta) => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get(ruta)
      .query({ porPagina: POR_PAGINA_MAXIMO + 1 })
      .set(cabecera(staff));

    expect(r.status).toBe(400);
    expect(r.body.error).toContain(String(POR_PAGINA_MAXIMO));
  });

  it.each(LISTADOS)('%s rechaza una página que no es un entero positivo', async (ruta) => {
    const staff = await obtenerToken();

    const cero = await request(app).get(ruta).query({ pagina: 0 }).set(cabecera(staff));
    const texto = await request(app).get(ruta).query({ pagina: 'dos' }).set(cabecera(staff));

    expect(cero.status).toBe(400);
    expect(texto.status).toBe(400);
  });

  /** Una página vacía es una respuesta válida, no un error. */
  it('una página más allá del final devuelve la lista vacía, no un error', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/ventas')
      .query({ pagina: 9999 })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.datos).toEqual([]);
    expect(r.body.total).toBeGreaterThanOrEqual(0);
  });

  it('siempre hay al menos una página, aunque no haya nada que mostrar', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/ordenes')
      .query({ estado: 'Cancelada', pagina: 1 })
      .set(cabecera(staff));

    expect(r.body.paginas).toBeGreaterThanOrEqual(1);
  });
});

describe('La página trae lo que se pidió', () => {
  it('respeta el tamaño solicitado', async () => {
    const staff = await obtenerToken();
    const producto = await buscarProducto('Barra de avena');

    // Tres ventas, para que haya al menos dos páginas de a dos.
    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .post('/api/ventas')
        .set(cabecera(staff))
        .send({ metodoPago: 'Efectivo', items: [{ idProducto: producto.id, cantidad: 1 }] })
        .expect(201);
    }

    const r = await request(app)
      .get('/api/ventas')
      .query({ porPagina: 2 })
      .set(cabecera(staff));

    expect(r.body.datos).toHaveLength(2);
    expect(r.body.porPagina).toBe(2);
    expect(r.body.total).toBeGreaterThan(2);
    expect(r.body.paginas).toBeGreaterThan(1);
  });

  /**
   * El total cuenta **todas** las que cumplen el filtro, no las que vinieron.
   * Confundirlos haría que el historial dijera «20 ventas» tenga el negocio
   * veinte o veinte mil.
   */
  it('el total no es el tamaño de la página', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/ventas')
      .query({ porPagina: 1 })
      .set(cabecera(staff));

    expect(r.body.datos).toHaveLength(1);
    expect(r.body.total).toBeGreaterThan(1);
  });

  it('la segunda página trae elementos distintos de la primera', async () => {
    const staff = await obtenerToken();

    const primera = await request(app)
      .get('/api/ventas')
      .query({ porPagina: 2, pagina: 1 })
      .set(cabecera(staff));
    const segunda = await request(app)
      .get('/api/ventas')
      .query({ porPagina: 2, pagina: 2 })
      .set(cabecera(staff));

    const idsPrimera = primera.body.datos.map((v: { id: number }) => v.id);
    const idsSegunda = segunda.body.datos.map((v: { id: number }) => v.id);

    expect(idsSegunda.some((id: number) => idsPrimera.includes(id))).toBe(false);
  });

  /** `paginas` es lo que la interfaz usa para navegar; si redondea mal, sobra o falta una. */
  it('calcula las páginas redondeando hacia arriba', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/ventas')
      .query({ porPagina: 1 })
      .set(cabecera(staff));

    expect(r.body.paginas).toBe(r.body.total);
  });
});

describe('Filtro por fecha', () => {
  /**
   * La otra mitad de H7: la página acota **cuánto** se trae y la fecha acota
   * **qué** se trae. Sin la segunda, buscar una venta de marzo obliga a
   * recorrer páginas hasta marzo.
   */
  it('las ventas de hoy son las de hoy', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/ventas')
      .query({ desde: hoy(), hasta: hoy() })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.total).toBeGreaterThan(0);
  });

  it('un período sin actividad devuelve cero, no todo', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/ventas')
      .query({ desde: '2020-01-01', hasta: '2020-01-02' })
      .set(cabecera(staff));

    expect(r.body.total).toBe(0);
    expect(r.body.datos).toEqual([]);
  });

  it('el filtro por fecha alcanza también a pedidos, notas y órdenes', async () => {
    const staff = await obtenerToken();
    const antiguo = { desde: '2020-01-01', hasta: '2020-01-02' };

    for (const ruta of ['/api/gestion/pedidos', '/api/ingresos', '/api/egresos', '/api/ordenes']) {
      const r = await request(app).get(ruta).query(antiguo).set(cabecera(staff));
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(0);
    }
  });

  it('el filtro por estado y el rango se combinan', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/gestion/pedidos')
      .query({ estado: 'Recibido', desde: hoy(), hasta: hoy() })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    for (const pedido of r.body.datos) expect(pedido.estadoPedido).toBe('Recibido');
  });
});

describe('Recuentos del tablero', () => {
  /**
   * El tablero cuenta **todos** los pedidos, no los de la página visible: si
   * contara la página, «3 en camino» significaría «3 de los 20 que caben en
   * pantalla», que no es lo que el tablero pregunta.
   */
  it('el resumen de pedidos cuenta más allá de la página', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    await crearPedido(cliente.token, 'Barra de avena');

    const [resumen, primeraPagina] = await Promise.all([
      request(app).get('/api/gestion/pedidos/resumen').set(cabecera(staff)),
      request(app).get('/api/gestion/pedidos').query({ porPagina: 1 }).set(cabecera(staff)),
    ]);

    expect(resumen.status).toBe(200);
    const contados = Object.values(resumen.body as Record<string, number>).reduce(
      (suma, n) => suma + n,
      0,
    );
    // La página trajo uno; el recuento tiene que contarlos todos.
    expect(primeraPagina.body.datos).toHaveLength(1);
    expect(contados).toBe(primeraPagina.body.total);
  });

  it('el resumen de órdenes agrupa por estado', async () => {
    const staff = await obtenerToken();
    const r = await request(app).get('/api/ordenes/resumen').set(cabecera(staff));

    expect(r.status).toBe(200);
    for (const [estado, cantidad] of Object.entries(r.body as Record<string, number>)) {
      expect(typeof estado).toBe('string');
      expect(cantidad).toBeGreaterThan(0);
    }
  });

  /** `resumen` no puede leerse como un identificador de orden. */
  it('la ruta del resumen no la captura la de detalle', async () => {
    const staff = await obtenerToken();
    const r = await request(app).get('/api/ordenes/resumen').set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty('id');
  });

  it('el resumen exige sesión y permiso', async () => {
    const cliente = await registrarCliente();

    const sinSesion = await request(app).get('/api/gestion/pedidos/resumen');
    expect(sinSesion.status).toBe(401);

    const comoCliente = await request(app)
      .get('/api/ordenes/resumen')
      .set(cabecera(cliente.token));
    expect(comoCliente.status).toBe(403);
  });
});
