import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { obtenerToken, registrarCliente, sufijo } from './ayudantes.js';

/**
 * Inventario › Lotes, y los motivos Devolución al proveedor y Reposición.
 *
 * Cada nota de ingreso es un lote —lo que entró junto— y cada una de sus
 * líneas es un lote de su ítem, con lo que costó la unidad en esa entrada. El
 * costo del insumo es un promedio y no dice a cuánto se pagó cada compra; el
 * lote sí.
 *
 * El recorrido: el aceite se compra a Bs 12 y después a Bs 15; un litro llega
 * vencido y se le devuelve al proveedor, que lo repone.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

const enDias = (dias: number) => {
  const d = new Date(Date.now() + dias * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let admin = '';
let seco = 0;
let refrigerado = 0;
let aceite = { id: 0, nombre: '' };
let harina = { id: 0, nombre: '' };
let leche = { id: 0, nombre: '' };

const ingresar = (cuerpo: object) =>
  request(app).post('/api/ingresos').set(cabecera(admin)).send(cuerpo);
const egresar = (cuerpo: object) =>
  request(app).post('/api/egresos').set(cabecera(admin)).send(cuerpo);
const ficha = async (id: number) =>
  (await request(app).get(`/api/insumos/${id}`).set(cabecera(admin))).body as {
    stockTotal: number;
    costoUnitario: number;
  };
const lotes = async (query: Record<string, string>) =>
  (await request(app).get('/api/ingresos/lotes').query(query).set(cabecera(admin)).expect(200)).body;

async function crearInsumo(nombre: string, unidad: string, extra: object = {}) {
  const unidades = (await request(app).get('/api/insumos/unidades').set(cabecera(admin))).body as {
    id: number;
    nombre: string;
  }[];
  const r = await request(app)
    .post('/api/insumos')
    .set(cabecera(admin))
    .send({
      nombre,
      idUnidad: unidades.find((u) => u.nombre === unidad)!.id,
      costoUnitario: 10,
      stockMinimo: 0,
      ...extra,
    })
    .expect(201);
  return { id: r.body.id as number, nombre };
}

beforeAll(async () => {
  admin = await obtenerToken();
  const almacenes = (await request(app).get('/api/almacenes').set(cabecera(admin))).body as {
    id: number;
    nombre: string;
  }[];
  seco = almacenes.find((a) => a.nombre === 'Almacen Seco')!.id;
  refrigerado = almacenes.find((a) => a.nombre === 'Camara Refrigerada')!.id;

  const s = sufijo();
  aceite = await crearInsumo(`Aceite ${s}`, 'Litro');
  harina = await crearInsumo(`Harina ${s}`, 'Kilogramo');
  leche = await crearInsumo(`Leche ${s}`, 'Litro', {
    tipoConservacion: 'Refrigerado',
    controlaVencimiento: true,
  });

  // Dos compras de aceite a distinto precio; la segunda trae también harina.
  await ingresar({
    motivo: 'Compra',
    proveedor: 'Distribuidora Sur',
    numeroDocumento: 'F-100',
    insumos: [{ idIngrediente: aceite.id, idAlmacen: seco, cantidad: 5, costoUnitario: 12 }],
  }).expect(201);
  await ingresar({
    motivo: 'Compra',
    proveedor: 'Distribuidora Sur',
    numeroDocumento: 'F-101',
    insumos: [
      { idIngrediente: aceite.id, idAlmacen: seco, cantidad: 5, costoUnitario: 15 },
      { idIngrediente: harina.id, idAlmacen: seco, cantidad: 25, costoUnitario: 6 },
    ],
  }).expect(201);
});

describe('Devolución al proveedor y Reposición', () => {
  it('el aceite comprado a Bs 12 y a Bs 15 cuesta en promedio Bs 13,50', async () => {
    expect(await ficha(aceite.id)).toMatchObject({ stockTotal: 10, costoUnitario: 13.5 });
  });

  it('un litro vencido se le devuelve al proveedor con una nota de egreso', async () => {
    const r = await egresar({
      motivo: 'Devolucion',
      observacion: 'Distribuidora Sur: llegó vencido',
      insumos: [{ idIngrediente: aceite.id, idAlmacen: seco, cantidad: 1 }],
    });

    expect(r.status).toBe(201);
    expect(r.body.nota.motivo).toBe('Devolucion');
    expect((await ficha(aceite.id)).stockTotal).toBe(9);
  });

  it('el proveedor lo repone: vuelve el litro y el costo del aceite no cambia', async () => {
    // Aunque se anote otro costo: solo una compra mueve el costo del insumo.
    const r = await ingresar({
      motivo: 'Reposicion',
      proveedor: 'Distribuidora Sur',
      insumos: [{ idIngrediente: aceite.id, idAlmacen: seco, cantidad: 1, costoUnitario: 20 }],
    });

    expect(r.status).toBe(201);
    expect(r.body.motivo).toBe('Reposicion');
    expect(await ficha(aceite.id)).toMatchObject({ stockTotal: 10, costoUnitario: 13.5 });
  });

  it('una devolución al proveedor también puede ser de un producto comprado', async () => {
    const productos = await request(app).get('/api/productos').set(cabecera(admin));
    const conStock = productos.body.find(
      (p: { existencias: { idAlmacen: number; stock: number }[] }) =>
        p.existencias.some((e) => e.idAlmacen === seco && e.stock > 0),
    );

    const r = await egresar({
      motivo: 'Devolucion',
      productos: [{ idProducto: conStock.id, idAlmacen: seco, cantidad: 1 }],
    });

    expect(r.status).toBe(201);
  });
});

describe('Inventario › Lotes · por ítem', () => {
  it('cada entrada del aceite es un lote con el precio que se pagó', async () => {
    const r = await lotes({ termino: aceite.nombre });

    // De la más reciente a la más antigua.
    expect(r.datos.map((l: { motivo: string; costoUnitario: number }) => [l.motivo, l.costoUnitario])).toEqual([
      ['Reposicion', 20],
      ['Compra', 15],
      ['Compra', 12],
    ]);
    expect(r.datos[2]).toMatchObject({
      tipo: 'insumo',
      nombre: aceite.nombre,
      unidad: 'L',
      almacen: 'Almacen Seco',
      cantidad: 5,
      subtotal: 60,
      proveedor: 'Distribuidora Sur',
      numeroDocumento: 'F-100',
      lote: null,
    });
    expect(r.total).toBe(3);
  });

  it('al buscar, resume cuánto varió su precio', async () => {
    const r = await lotes({ termino: aceite.nombre });

    expect(r.resumen).toEqual([
      expect.objectContaining({
        nombre: aceite.nombre,
        lotes: 3,
        cantidad: 11,
        costoMinimo: 12,
        costoMaximo: 20,
        costoUltimo: 20,
        costoActual: 13.5,
      }),
    ]);
  });

  it('filtra por motivo y por tipo', async () => {
    const compras = await lotes({ termino: aceite.nombre, motivo: 'Compra' });
    expect(compras.datos.map((l: { costoUnitario: number }) => l.costoUnitario)).toEqual([15, 12]);

    const comoProducto = await lotes({ termino: aceite.nombre, tipo: 'producto' });
    expect(comoProducto.total).toBe(0);
  });

  it('un perecedero muestra su lote, su vencimiento y cuánto queda de él', async () => {
    await ingresar({
      motivo: 'Compra',
      insumos: [
        {
          idIngrediente: leche.id,
          idAlmacen: refrigerado,
          cantidad: 4,
          costoUnitario: 8,
          codigoLote: 'L-7',
          fechaVencimiento: enDias(10),
        },
      ],
    }).expect(201);
    await egresar({
      motivo: 'Merma',
      insumos: [{ idIngrediente: leche.id, idAlmacen: refrigerado, cantidad: 1 }],
    }).expect(201);

    const r = await lotes({ termino: leche.nombre });

    expect(r.datos[0].lote).toEqual({ codigo: 'L-7', vencimiento: enDias(10), queda: 3 });
  });
});

describe('Inventario › Lotes · por lote', () => {
  it('buscar el aceite trae las notas que lo traen, con todo lo que entró junto', async () => {
    const r = await request(app)
      .get('/api/ingresos')
      .query({ termino: aceite.nombre })
      .set(cabecera(admin))
      .expect(200);

    expect(r.body.total).toBe(3);
    const f101 = r.body.datos.find((n: { numeroDocumento: string }) => n.numeroDocumento === 'F-101');
    expect(f101.lineas.map((l: { nombre: string }) => l.nombre).sort()).toEqual(
      [aceite.nombre, harina.nombre].sort(),
    );
  });

  it('la línea de un perecedero trae su lote también en la nota', async () => {
    const r = await request(app)
      .get('/api/ingresos')
      .query({ termino: leche.nombre, tipo: 'insumo' })
      .set(cabecera(admin))
      .expect(200);

    expect(r.body.datos[0].lineas[0].lote).toEqual({ codigo: 'L-7', vencimiento: enDias(10), queda: 3 });
  });

  it('un cliente no ve los lotes', async () => {
    const cliente = await registrarCliente();
    const r = await request(app).get('/api/ingresos/lotes').set(cabecera(cliente.token));
    expect(r.status).toBe(403);
  });
});
