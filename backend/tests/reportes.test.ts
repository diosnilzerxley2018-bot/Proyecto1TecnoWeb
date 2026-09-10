import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { obtenerToken, registrarCliente, buscarProducto, sufijo } from './ayudantes.js';
import { MensajeroSimulado, reiniciarMensajero } from '../src/correo/index.js';

/**
 * RF-VEN-07 — reporte parametrizado de ventas por rango de fechas y por
 * producto, exportable a PDF y enviable por correo electrónico.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Hoy en formato ISO local, que es el que espera el filtro. */
function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function venderHoy(token: string, cantidad: number) {
  const producto = await buscarProducto('Barra de avena');
  const r = await request(app)
    .post('/api/ventas')
    .set(cabecera(token))
    .send({ metodoPago: 'Efectivo', items: [{ idProducto: producto.id, cantidad }] });
  return { venta: r, idProducto: producto.id as number, precio: producto.precio as number };
}

beforeEach(() => reiniciarMensajero());

describe('Reporte de ventas', () => {
  it('resume el período con las cifras que importan', async () => {
    const staff = await obtenerToken();
    const { precio } = await venderHoy(staff, 2);

    const r = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: hoy(), hasta: hoy() })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.resumen.cantidadVentas).toBeGreaterThan(0);
    expect(r.body.resumen.total).toBeGreaterThanOrEqual(precio * 2);
    expect(r.body.resumen.ticketPromedio).toBeGreaterThan(0);
    expect(r.body.porProducto.length).toBeGreaterThan(0);
  });

  /** Es lo que responde "qué se vende", que es la pregunta del dueño. */
  it('ordena los productos del que más vendió al que menos', async () => {
    const staff = await obtenerToken();
    await venderHoy(staff, 3);

    const r = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: hoy(), hasta: hoy() })
      .set(cabecera(staff));

    const importes = r.body.porProducto.map((p: { importe: number }) => p.importe);
    expect([...importes].sort((a, b) => b - a)).toEqual(importes);
  });

  it('la participación de cada producto suma cien', async () => {
    const staff = await obtenerToken();
    await venderHoy(staff, 1);

    const r = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: hoy(), hasta: hoy() })
      .set(cabecera(staff));

    const suma = r.body.porProducto.reduce(
      (t: number, p: { participacion: number }) => t + p.participacion,
      0,
    );
    expect(suma).toBeGreaterThan(99);
    expect(suma).toBeLessThan(101);
  });

  /**
   * El filtro por producto no puede atribuirle a un jugo lo que el cliente
   * gastó en la ensalada de la misma venta.
   */
  it('filtrado por producto, solo cuenta ese producto', async () => {
    const staff = await obtenerToken();
    const barra = await buscarProducto('Barra de avena');
    const galleta = await buscarProducto('Galletas de avena');

    await request(app)
      .post('/api/ventas')
      .set(cabecera(staff))
      .send({
        metodoPago: 'Efectivo',
        items: [
          { idProducto: barra.id, cantidad: 1 },
          { idProducto: galleta.id, cantidad: 1 },
        ],
      })
      .expect(201);

    const r = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: hoy(), hasta: hoy(), idProducto: barra.id })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.producto).toContain('Barra de avena');
    // Solo aparece el producto filtrado.
    expect(r.body.porProducto).toHaveLength(1);
    expect(r.body.porProducto[0].idProducto).toBe(barra.id);
  });

  it('un período sin ventas devuelve ceros, no un error', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: '2020-01-01', hasta: '2020-01-31' })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.resumen.cantidadVentas).toBe(0);
    expect(r.body.resumen.total).toBe(0);
    expect(r.body.porProducto).toEqual([]);
  });

  /** Una venta anulada no es un ingreso: sumarla descuadraría con la caja. */
  it('no cuenta las ventas anuladas', async () => {
    const staff = await obtenerToken();

    const antes = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: hoy(), hasta: hoy() })
      .set(cabecera(staff));

    const { venta } = await venderHoy(staff, 1);
    await request(app)
      .post(`/api/ventas/${venta.body.id}/anular`)
      .set(cabecera(staff))
      .send({ motivo: 'Prueba del reporte' })
      .expect(200);

    const despues = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: hoy(), hasta: hoy() })
      .set(cabecera(staff));

    expect(despues.body.resumen.total).toBe(antes.body.resumen.total);
  });
});

describe('Validación de los filtros', () => {
  it('rechaza un rango invertido', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: '2026-09-30', hasta: '2026-09-01' })
      .set(cabecera(staff));

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('posterior');
  });

  it('rechaza un rango de años', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: '2020-01-01', hasta: '2026-01-01' })
      .set(cabecera(staff));

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('366');
  });

  it('rechaza un producto que no existe', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: hoy(), hasta: hoy(), idProducto: 999999 })
      .set(cabecera(staff));

    expect(r.status).toBe(404);
  });

  it('un cliente no consulta los reportes del negocio', async () => {
    const cliente = await registrarCliente();
    const r = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: hoy(), hasta: hoy() })
      .set(cabecera(cliente.token));

    expect(r.status).toBe(403);
  });
});

describe('Exportación a PDF', () => {
  it('devuelve un PDF de verdad', async () => {
    const staff = await obtenerToken();
    await venderHoy(staff, 1);

    const r = await request(app)
      .get('/api/reportes/ventas.pdf')
      .query({ desde: hoy(), hasta: hoy() })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/pdf');
    // Todo PDF empieza con esta firma.
    expect(r.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(r.body.length).toBeGreaterThan(1000);
  });

  it('el nombre del archivo dice el período', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/reportes/ventas.pdf')
      .query({ desde: hoy(), hasta: hoy() })
      .set(cabecera(staff));

    expect(r.headers['content-disposition']).toContain(`ventas-${hoy()}-a-${hoy()}.pdf`);
  });

  it('genera el PDF aunque no haya ninguna venta', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/reportes/ventas.pdf')
      .query({ desde: '2020-01-01', hasta: '2020-01-31' })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('Envío por correo', () => {
  it('manda el reporte adjunto en PDF', async () => {
    const staff = await obtenerToken();
    await venderHoy(staff, 1);

    const destino = `gerencia${sufijo()}@tecnologia.web`;
    const r = await request(app)
      .post('/api/reportes/ventas/enviar')
      .set(cabecera(staff))
      .send({ desde: hoy(), hasta: hoy(), para: destino });

    expect(r.status).toBe(200);
    expect(r.body.enviado).toBe(true);

    const correo = MensajeroSimulado.enviados[0];
    expect(correo.para).toBe(destino);
    expect(correo.asunto).toContain('Reporte de ventas');
    expect(correo.adjuntos).toHaveLength(1);
    expect(correo.adjuntos![0].tipo).toBe('application/pdf');
    expect(correo.adjuntos![0].contenido.subarray(0, 4).toString()).toBe('%PDF');
  });

  /** Quien lo pidió a mano necesita saber si llegó. */
  it('el cuerpo adelanta el resumen sin abrir el adjunto', async () => {
    const staff = await obtenerToken();
    await venderHoy(staff, 1);

    await request(app)
      .post('/api/reportes/ventas/enviar')
      .set(cabecera(staff))
      .send({ desde: hoy(), hasta: hoy(), para: 'gerencia@tecnologia.web' })
      .expect(200);

    const correo = MensajeroSimulado.enviados[0];
    expect(correo.texto).toContain('venta(s)');
    expect(correo.texto).toContain('Bs');
  });

  it('rechaza un correo mal formado', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .post('/api/reportes/ventas/enviar')
      .set(cabecera(staff))
      .send({ desde: hoy(), hasta: hoy(), para: 'no-es-un-correo' });

    expect(r.status).toBe(400);
  });
});
