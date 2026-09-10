import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { obtenerToken, registrarCliente, sufijo } from './ayudantes.js';

/**
 * Etapa 2 del inventario: CU-INV-01 Gestionar Insumo y CU-INV-02 Gestionar
 * Almacén, con los permisos que corresponden a cada actor.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

/** El rol Empleado tiene INSUMO_GESTIONAR y STOCK_CONSULTAR, pero no ALMACEN_GESTIONAR. */
const tokenEmpleado = () => obtenerToken('repartidor', 'Reparto1234!');

async function buscarInsumo(token: string, termino: string) {
  const r = await request(app).get('/api/insumos').query({ termino }).set(cabecera(token));
  if (r.status !== 200 || r.body.length === 0) {
    throw new Error(`No se encontró el insumo "${termino}"`);
  }
  return r.body[0];
}

async function crearInsumoDePrueba(token: string, extra: Record<string, unknown> = {}) {
  const unidades = await request(app).get('/api/insumos/unidades').set(cabecera(token));
  const kilogramo = unidades.body.find((u: { nombre: string }) => u.nombre === 'Kilogramo');

  const r = await request(app)
    .post('/api/insumos')
    .set(cabecera(token))
    .send({
      nombre: `Insumo ${sufijo()}`,
      idUnidad: kilogramo.id,
      costoUnitario: 10,
      stockMinimo: 1,
      ...extra,
    });
  if (r.status !== 201) throw new Error(`No se pudo crear el insumo: ${JSON.stringify(r.body)}`);
  return r.body;
}

describe('CU-INV-02 Gestionar almacén', () => {
  it('lista los almacenes cargados', async () => {
    const admin = await obtenerToken();
    const r = await request(app).get('/api/almacenes').set(cabecera(admin));

    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThanOrEqual(2);
    expect(r.body[0]).toHaveProperty('tipoConservacion');
  });

  it('registra un almacén nuevo', async () => {
    const admin = await obtenerToken();
    const nombre = `Deposito ${sufijo()}`;

    const r = await request(app)
      .post('/api/almacenes')
      .set(cabecera(admin))
      .send({ nombre, tipoConservacion: 'Seco', ubicacionFisica: 'Planta alta' });

    expect(r.status).toBe(201);
    expect(r.body.nombre).toBe(nombre);
    expect(r.body.tipoConservacion).toBe('Seco');

    // Se retira: dejar almacenes sueltos rompe la deducción por conservación
    // que hacen otras suites.
    await request(app).delete(`/api/almacenes/${r.body.id}`).set(cabecera(admin)).expect(204);
  });

  it('rechaza un nombre duplicado', async () => {
    const admin = await obtenerToken();
    const nombre = `Deposito ${sufijo()}`;
    const cuerpo = { nombre, tipoConservacion: 'Seco' };

    const primero = await request(app)
      .post('/api/almacenes')
      .set(cabecera(admin))
      .send(cuerpo)
      .expect(201);
    const r = await request(app).post('/api/almacenes').set(cabecera(admin)).send(cuerpo);

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Ya existe un almacén');

    await request(app).delete(`/api/almacenes/${primero.body.id}`).set(cabecera(admin)).expect(204);
  });

  it('rechaza un tipo de conservación fuera del esquema', async () => {
    const admin = await obtenerToken();
    const r = await request(app)
      .post('/api/almacenes')
      .set(cabecera(admin))
      .send({ nombre: `Deposito ${sufijo()}`, tipoConservacion: 'Congelado' });

    expect(r.status).toBe(400);
  });

  it('modifica un almacén existente', async () => {
    const admin = await obtenerToken();
    const creado = await request(app)
      .post('/api/almacenes')
      .set(cabecera(admin))
      .send({ nombre: `Deposito ${sufijo()}`, tipoConservacion: 'Seco' })
      .expect(201);

    const r = await request(app)
      .put(`/api/almacenes/${creado.body.id}`)
      .set(cabecera(admin))
      .send({ tipoConservacion: 'Refrigerado', ubicacionFisica: 'Subsuelo' });

    expect(r.status).toBe(200);
    expect(r.body.tipoConservacion).toBe('Refrigerado');
    expect(r.body.ubicacionFisica).toBe('Subsuelo');

    await request(app).delete(`/api/almacenes/${creado.body.id}`).set(cabecera(admin)).expect(204);
  });

  it('elimina un almacén sin existencias', async () => {
    const admin = await obtenerToken();
    const creado = await request(app)
      .post('/api/almacenes')
      .set(cabecera(admin))
      .send({ nombre: `Deposito ${sufijo()}`, tipoConservacion: 'Seco' })
      .expect(201);

    await request(app)
      .delete(`/api/almacenes/${creado.body.id}`)
      .set(cabecera(admin))
      .expect(204);

    await request(app)
      .get(`/api/almacenes/${creado.body.id}`)
      .set(cabecera(admin))
      .expect(404);
  });

  it('no elimina un almacén que registra existencias', async () => {
    const admin = await obtenerToken();
    const almacenes = await request(app).get('/api/almacenes').set(cabecera(admin));
    const conStock = almacenes.body.find((a: { nombre: string }) => a.nombre === 'Almacen Seco');

    const r = await request(app)
      .delete(`/api/almacenes/${conStock.id}`)
      .set(cabecera(admin));

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('existencias o movimientos');
  });

  it('el personal puede consultarlos pero no administrarlos', async () => {
    const empleado = await tokenEmpleado();

    await request(app).get('/api/almacenes').set(cabecera(empleado)).expect(200);

    const r = await request(app)
      .post('/api/almacenes')
      .set(cabecera(empleado))
      .send({ nombre: `Deposito ${sufijo()}`, tipoConservacion: 'Seco' });

    expect(r.status).toBe(403);
    expect(r.body.error).toContain('ALMACEN_GESTIONAR');
  });

  it('un cliente no accede al inventario', async () => {
    const cliente = await registrarCliente();
    const r = await request(app).get('/api/almacenes').set(cabecera(cliente.token));
    expect(r.status).toBe(403);
  });
});

describe('CU-INV-01 Gestionar insumo', () => {
  it('lista los insumos con su unidad y stock total', async () => {
    const empleado = await tokenEmpleado();
    const r = await request(app).get('/api/insumos').set(cabecera(empleado));

    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThanOrEqual(10);

    // El stock es un valor vivo que otros movimientos alteran: se verifica su
    // estructura y coherencia, no una cifra concreta del seed.
    const quinua = r.body.find((i: { nombre: string }) => i.nombre === 'Quinua real');
    expect(quinua.unidad.abreviatura).toBe('kg');
    expect(quinua.existencias[0].almacen).toBe('Almacen Seco');
    expect(quinua.stockTotal).toBeGreaterThan(0);
    expect(quinua.stockTotal).toBe(
      quinua.existencias.reduce((t: number, e: { stock: number }) => t + e.stock, 0),
    );
  });

  it('lista las unidades de medida', async () => {
    const empleado = await tokenEmpleado();
    const r = await request(app).get('/api/insumos/unidades').set(cabecera(empleado));

    expect(r.status).toBe(200);
    expect(r.body.map((u: { abreviatura: string }) => u.abreviatura)).toContain('kg');
  });

  it('busca por coincidencia parcial sin distinguir mayúsculas', async () => {
    const empleado = await tokenEmpleado();
    const r = await request(app)
      .get('/api/insumos')
      .query({ termino: 'ACEITE' })
      .set(cabecera(empleado));

    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].nombre).toBe('Aceite de oliva');
  });

  it('registra un insumo nuevo', async () => {
    const empleado = await tokenEmpleado();
    const insumo = await crearInsumoDePrueba(empleado, { costoUnitario: 7.5, stockMinimo: 3 });

    expect(insumo.costoUnitario).toBe(7.5);
    expect(insumo.stockMinimo).toBe(3);
    expect(insumo.activo).toBe(true);
    expect(insumo.stockTotal).toBe(0);
  });

  it('rechaza un costo unitario negativo', async () => {
    const empleado = await tokenEmpleado();
    const unidades = await request(app).get('/api/insumos/unidades').set(cabecera(empleado));

    const r = await request(app)
      .post('/api/insumos')
      .set(cabecera(empleado))
      .send({
        nombre: `Insumo ${sufijo()}`,
        idUnidad: unidades.body[0].id,
        costoUnitario: -1,
        stockMinimo: 0,
      });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('no puede ser negativo');
  });

  it('rechaza un stock mínimo negativo', async () => {
    const empleado = await tokenEmpleado();
    const unidades = await request(app).get('/api/insumos/unidades').set(cabecera(empleado));

    const r = await request(app)
      .post('/api/insumos')
      .set(cabecera(empleado))
      .send({
        nombre: `Insumo ${sufijo()}`,
        idUnidad: unidades.body[0].id,
        costoUnitario: 5,
        stockMinimo: -2,
      });

    expect(r.status).toBe(400);
  });

  it('rechaza una unidad de medida inexistente', async () => {
    const empleado = await tokenEmpleado();
    const r = await request(app)
      .post('/api/insumos')
      .set(cabecera(empleado))
      .send({
        nombre: `Insumo ${sufijo()}`,
        idUnidad: 999999,
        costoUnitario: 5,
        stockMinimo: 1,
      });

    expect(r.status).toBe(404);
    expect(r.body.error).toContain('unidad de medida');
  });

  it('no permite cambiar la unidad de un insumo que registra existencias', async () => {
    const empleado = await tokenEmpleado();
    const quinua = await buscarInsumo(empleado, 'Quinua');
    const unidades = await request(app).get('/api/insumos/unidades').set(cabecera(empleado));
    const gramo = unidades.body.find((u: { nombre: string }) => u.nombre === 'Gramo');

    const r = await request(app)
      .put(`/api/insumos/${quinua.id}`)
      .set(cabecera(empleado))
      .send({ idUnidad: gramo.id });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('unidad de medida');
  });

  it('sí permite cambiarla cuando todavía no hay existencias', async () => {
    const empleado = await tokenEmpleado();
    const insumo = await crearInsumoDePrueba(empleado);
    const unidades = await request(app).get('/api/insumos/unidades').set(cabecera(empleado));
    const litro = unidades.body.find((u: { nombre: string }) => u.nombre === 'Litro');

    const r = await request(app)
      .put(`/api/insumos/${insumo.id}`)
      .set(cabecera(empleado))
      .send({ idUnidad: litro.id });

    expect(r.status).toBe(200);
    expect(r.body.unidad.abreviatura).toBe('L');
  });

  it('permite la baja lógica y la oculta del listado por defecto', async () => {
    const empleado = await tokenEmpleado();
    const insumo = await crearInsumoDePrueba(empleado);

    await request(app)
      .put(`/api/insumos/${insumo.id}`)
      .set(cabecera(empleado))
      .send({ activo: false })
      .expect(200);

    const activos = await request(app)
      .get('/api/insumos')
      .query({ termino: insumo.nombre })
      .set(cabecera(empleado));
    expect(activos.body).toHaveLength(0);

    const todos = await request(app)
      .get('/api/insumos')
      .query({ termino: insumo.nombre, incluirInactivos: 'true' })
      .set(cabecera(empleado));
    expect(todos.body).toHaveLength(1);
    expect(todos.body[0].activo).toBe(false);
  });

  it('interpreta incluirInactivos=false como falso', async () => {
    const empleado = await tokenEmpleado();
    const insumo = await crearInsumoDePrueba(empleado);

    await request(app)
      .put(`/api/insumos/${insumo.id}`)
      .set(cabecera(empleado))
      .send({ activo: false })
      .expect(200);

    const r = await request(app)
      .get('/api/insumos')
      .query({ termino: insumo.nombre, incluirInactivos: 'false' })
      .set(cabecera(empleado));

    expect(r.body).toHaveLength(0);
  });

  it('elimina un insumo sin recetas, movimientos ni existencias', async () => {
    const empleado = await tokenEmpleado();
    const insumo = await crearInsumoDePrueba(empleado);

    await request(app).delete(`/api/insumos/${insumo.id}`).set(cabecera(empleado)).expect(204);
    await request(app).get(`/api/insumos/${insumo.id}`).set(cabecera(empleado)).expect(404);
  });

  it('no elimina un insumo que registra existencias', async () => {
    const empleado = await tokenEmpleado();
    const quinua = await buscarInsumo(empleado, 'Quinua');

    const r = await request(app).delete(`/api/insumos/${quinua.id}`).set(cabecera(empleado));

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('existencias');
    expect(r.body.error).toContain('darlo de baja');
  });

  it('responde 404 por un insumo inexistente', async () => {
    const empleado = await tokenEmpleado();
    const r = await request(app).get('/api/insumos/999999').set(cabecera(empleado));
    expect(r.status).toBe(404);
  });

  it('un cliente no puede gestionar insumos', async () => {
    const cliente = await registrarCliente();
    const r = await request(app).get('/api/insumos').set(cabecera(cliente.token));
    expect(r.status).toBe(403);
  });
});
