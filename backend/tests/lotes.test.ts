import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { obtenerToken, sufijo } from './ayudantes.js';

/**
 * Hallazgo A6 — trazabilidad de lotes y vencimiento de insumos perecederos.
 *
 * Verifica las tres propiedades que motivaron el cambio: que un perecedero no
 * pueda ingresar sin vencimiento, que el consumo salga del lote que vence
 * antes (FEFO) y que el total consolidado y el desglose por lote no diverjan.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Fecha en formato ISO corto, desplazada los días indicados desde hoy.
 *
 * Se arma con los componentes **locales** y no con `toISOString`, que convierte
 * a UTC: en un huso al oeste de Greenwich, a partir del atardecer esa
 * conversión ya cae en el día siguiente y el desfase de un día haría fallar
 * las comprobaciones. Es además lo que produce un campo de fecha del navegador.
 */
function enDias(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

async function idAlmacen(token: string, nombre: string) {
  const r = await request(app).get('/api/almacenes').set(cabecera(token));
  return r.body.find((a: { nombre: string }) => a.nombre === nombre).id as number;
}

async function buscarInsumo(token: string, termino: string) {
  const r = await request(app).get('/api/insumos').query({ termino }).set(cabecera(token));
  return r.body[0];
}

async function crearPerecedero(token: string) {
  const unidades = await request(app).get('/api/insumos/unidades').set(cabecera(token));
  const litro = unidades.body.find((u: { nombre: string }) => u.nombre === 'Litro');

  const r = await request(app)
    .post('/api/insumos')
    .set(cabecera(token))
    .send({
      nombre: `Perecedero ${sufijo()}`,
      idUnidad: litro.id,
      costoUnitario: 10,
      stockMinimo: 1,
      tipoConservacion: 'Refrigerado',
      controlaVencimiento: true,
    })
    .expect(201);
  return r.body;
}

describe('A6 · Control de vencimiento en el insumo', () => {
  it('marca los insumos frescos del catálogo como perecederos', async () => {
    const staff = await obtenerToken();

    const yogur = await buscarInsumo(staff, 'Yogur');
    const harina = await buscarInsumo(staff, 'Harina');

    expect(yogur.controlaVencimiento).toBe(true);
    expect(harina.controlaVencimiento).toBe(false);
  });

  it('permite activar el control al editar un insumo', async () => {
    const staff = await obtenerToken();
    const insumo = await crearPerecedero(staff);

    const r = await request(app)
      .put(`/api/insumos/${insumo.id}`)
      .set(cabecera(staff))
      .send({ controlaVencimiento: false });

    expect(r.status).toBe(200);
    expect(r.body.controlaVencimiento).toBe(false);
  });
});

describe('A6 · Ingreso con lote', () => {
  it('rechaza el ingreso de un perecedero sin fecha de vencimiento', async () => {
    const staff = await obtenerToken();
    const almacen = await idAlmacen(staff, 'Camara Refrigerada');
    const insumo = await crearPerecedero(staff);

    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 5, costoUnitario: 10 }],
      });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('perecedero');
  });

  it('registra el lote y mueve el total consolidado a la vez', async () => {
    const staff = await obtenerToken();
    const almacen = await idAlmacen(staff, 'Camara Refrigerada');
    const insumo = await crearPerecedero(staff);

    await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [
          {
            idIngrediente: insumo.id,
            idAlmacen: almacen,
            cantidad: 8,
            costoUnitario: 10,
            codigoLote: 'L-001',
            fechaVencimiento: enDias(15),
          },
        ],
      })
      .expect(201);

    const actualizado = await buscarInsumo(staff, insumo.nombre);
    expect(actualizado.stockTotal).toBe(8);

    const lotes = await request(app).get('/api/stock/vencimientos').set(cabecera(staff));
    const propio = lotes.body.filter((l: { insumo: string }) => l.insumo === insumo.nombre);

    expect(propio).toHaveLength(1);
    expect(propio[0].codigo).toBe('L-001');
    expect(propio[0].stock).toBe(8);
    expect(propio[0].diasParaVencer).toBe(15);
    expect(propio[0].vencido).toBe(false);
  });

  it('no exige lote a un insumo que no controla vencimiento', async () => {
    const staff = await obtenerToken();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const harina = await buscarInsumo(staff, 'Harina');

    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [{ idIngrediente: harina.id, idAlmacen: almacen, cantidad: 3, costoUnitario: 11 }],
      });

    expect(r.status).toBe(201);
  });

  it('impide mezclar dos lotes del mismo insumo en una sola nota', async () => {
    const staff = await obtenerToken();
    const almacen = await idAlmacen(staff, 'Camara Refrigerada');
    const insumo = await crearPerecedero(staff);

    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [
          {
            idIngrediente: insumo.id,
            idAlmacen: almacen,
            cantidad: 2,
            costoUnitario: 10,
            fechaVencimiento: enDias(5),
          },
          {
            idIngrediente: insumo.id,
            idAlmacen: almacen,
            cantidad: 3,
            costoUnitario: 10,
            fechaVencimiento: enDias(30),
          },
        ],
      });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('dos lotes distintos');
  });
});

describe('A6 · Consumo FEFO', () => {
  it('consume primero el lote que vence antes', async () => {
    const staff = await obtenerToken();
    const almacen = await idAlmacen(staff, 'Camara Refrigerada');
    const insumo = await crearPerecedero(staff);

    // Dos notas: el lote lejano entra primero, para que el orden de ingreso
    // no coincida con el de vencimiento y la prueba sea significativa.
    for (const [dias, codigo, cantidad] of [
      [40, 'L-LEJANO', 10],
      [3, 'L-PROXIMO', 6],
    ] as const) {
      await request(app)
        .post('/api/ingresos')
        .set(cabecera(staff))
        .send({
          insumos: [
            {
              idIngrediente: insumo.id,
              idAlmacen: almacen,
              cantidad,
              costoUnitario: 10,
              codigoLote: codigo,
              fechaVencimiento: enDias(dias),
            },
          ],
        })
        .expect(201);
    }

    // Se egresan 8: deben salir los 6 del lote próximo y 2 del lejano.
    await request(app)
      .post('/api/egresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Produccion',
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 8 }],
      })
      .expect(201);

    const lotes = await request(app).get('/api/stock/vencimientos').set(cabecera(staff));
    const propios = lotes.body.filter((l: { insumo: string }) => l.insumo === insumo.nombre);

    // El lote próximo se agotó y desaparece; queda el lejano con 8.
    expect(propios).toHaveLength(1);
    expect(propios[0].codigo).toBe('L-LEJANO');
    expect(propios[0].stock).toBe(8);
  });

  it('mantiene el total consolidado igual a la suma de sus lotes', async () => {
    const staff = await obtenerToken();
    const almacen = await idAlmacen(staff, 'Camara Refrigerada');
    const insumo = await crearPerecedero(staff);

    await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [
          {
            idIngrediente: insumo.id,
            idAlmacen: almacen,
            cantidad: 12,
            costoUnitario: 10,
            fechaVencimiento: enDias(20),
          },
        ],
      })
      .expect(201);

    await request(app)
      .post('/api/egresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Merma',
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 4.5 }],
      })
      .expect(201);

    const consolidado = await buscarInsumo(staff, insumo.nombre);
    const lotes = await request(app).get('/api/stock/vencimientos').set(cabecera(staff));
    const suma = lotes.body
      .filter((l: { insumo: string }) => l.insumo === insumo.nombre)
      .reduce((total: number, l: { stock: number }) => total + l.stock, 0);

    expect(consolidado.stockTotal).toBe(7.5);
    expect(suma).toBe(consolidado.stockTotal);
  });
});

describe('A6 · Consulta de vencimientos', () => {
  it('acota el horizonte con el parámetro de días', async () => {
    const staff = await obtenerToken();
    const almacen = await idAlmacen(staff, 'Camara Refrigerada');
    const insumo = await crearPerecedero(staff);

    await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [
          {
            idIngrediente: insumo.id,
            idAlmacen: almacen,
            cantidad: 5,
            costoUnitario: 10,
            fechaVencimiento: enDias(90),
          },
        ],
      })
      .expect(201);

    const cercanos = await request(app)
      .get('/api/stock/vencimientos')
      .query({ dias: 7 })
      .set(cabecera(staff));

    const aparece = cercanos.body.some((l: { insumo: string }) => l.insumo === insumo.nombre);
    expect(aparece).toBe(false);
  });

  it('devuelve los lotes ordenados por proximidad de vencimiento', async () => {
    const staff = await obtenerToken();
    const r = await request(app).get('/api/stock/vencimientos').set(cabecera(staff));

    expect(r.status).toBe(200);
    const fechas = r.body.map((l: { fechaVencimiento: string }) => l.fechaVencimiento);
    expect(fechas).toEqual([...fechas].sort());
  });

  it('rechaza un horizonte inválido', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/stock/vencimientos')
      .query({ dias: -5 })
      .set(cabecera(staff));

    expect(r.status).toBe(400);
  });

  it('un cliente no puede consultar los vencimientos', async () => {
    const r = await request(app).get('/api/stock/vencimientos');
    expect(r.status).toBe(401);
  });
});
