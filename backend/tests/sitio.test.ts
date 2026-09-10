import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

/** RF-WEB-03 — contador de visitas acumuladas del sitio. */
describe('RF-WEB-03 Contador de visitas', () => {
  it('consulta el contador sin necesidad de sesión', async () => {
    const r = await request(app).get('/api/visitas');

    expect(r.status).toBe(200);
    expect(r.body.total).toBeTypeOf('number');
    expect(r.body).toHaveProperty('desde');
  });

  it('incrementa el total al registrar una visita', async () => {
    const antes = await request(app).get('/api/visitas');

    const r = await request(app).post('/api/visitas').send({ ruta: '/portal' });

    expect(r.status).toBe(201);
    expect(r.body.total).toBe(antes.body.total + 1);
  });

  it('admite el registro sin indicar la ruta', async () => {
    const r = await request(app).post('/api/visitas').send({});
    expect(r.status).toBe(201);
  });

  it('rechaza una ruta que excede el largo admitido', async () => {
    const r = await request(app)
      .post('/api/visitas')
      .send({ ruta: 'x'.repeat(300) });

    expect(r.status).toBe(400);
  });
});
