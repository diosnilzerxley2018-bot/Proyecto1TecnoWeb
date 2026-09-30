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
let compraF100 = 0;
let compraF101 = 0;
let devolucion = 0;

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
  compraF100 = (
    await ingresar({
      motivo: 'Compra',
      proveedor: 'Distribuidora Sur',
      numeroDocumento: 'F-100',
      insumos: [{ idIngrediente: aceite.id, idAlmacen: seco, cantidad: 5, costoUnitario: 12 }],
    }).expect(201)
  ).body.id;
  compraF101 = (
    await ingresar({
      motivo: 'Compra',
      proveedor: 'Distribuidora Sur',
      numeroDocumento: 'F-101',
      insumos: [
        { idIngrediente: aceite.id, idAlmacen: seco, cantidad: 5, costoUnitario: 15 },
        { idIngrediente: harina.id, idAlmacen: seco, cantidad: 25, costoUnitario: 6 },
      ],
    }).expect(201)
  ).body.id;
});

describe('Compra → Devolución al proveedor → Reposición', () => {
  it('el aceite comprado a Bs 12 y a Bs 15 cuesta en promedio Bs 13,50', async () => {
    expect(await ficha(aceite.id)).toMatchObject({ stockTotal: 10, costoUnitario: 13.5 });
  });

  it('una devolución dice qué compra devuelve: sin ella se rechaza', async () => {
    const r = await egresar({
      motivo: 'Devolucion',
      insumos: [{ idIngrediente: aceite.id, idAlmacen: seco, cantidad: 1 }],
    });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('indica la compra que devuelve');
  });

  it('el formulario ofrece la compra con lo que se puede devolver de cada línea', async () => {
    const r = await request(app).get('/api/ingresos/devolubles').set(cabecera(admin)).expect(200);

    const f101 = r.body.find((c: { id: number }) => c.id === compraF101);
    expect(f101).toMatchObject({ proveedor: 'Distribuidora Sur', numeroDocumento: 'F-101' });
    expect(f101.lineas).toEqual([
      expect.objectContaining({ nombre: aceite.nombre, cantidad: 5, vinculado: 0, pendiente: 5, costoUnitario: 15 }),
      expect.objectContaining({ nombre: harina.nombre, cantidad: 25, pendiente: 25, costoUnitario: 6 }),
    ]);
  });

  it('un litro vencido de la compra F-101 se le devuelve al proveedor', async () => {
    const r = await egresar({
      motivo: 'Devolucion',
      idNotaIngreso: compraF101,
      observacion: 'Distribuidora Sur: llegó vencido',
      insumos: [{ idIngrediente: aceite.id, idAlmacen: seco, cantidad: 1 }],
    });

    expect(r.status).toBe(201);
    expect(r.body.nota).toMatchObject({ motivo: 'Devolucion', idCompra: compraF101 });
    devolucion = r.body.nota.id;
    expect((await ficha(aceite.id)).stockTotal).toBe(9);
  });

  it('no se devuelve lo que no entró en esa compra', async () => {
    const r = await egresar({
      motivo: 'Devolucion',
      idNotaIngreso: compraF100,
      insumos: [{ idIngrediente: harina.id, idAlmacen: seco, cantidad: 1 }],
    });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('Solo se devuelve lo que entró en la compra');
  });

  it('ni más de lo que falta devolver de ella', async () => {
    const r = await egresar({
      motivo: 'Devolucion',
      idNotaIngreso: compraF101,
      insumos: [{ idIngrediente: aceite.id, idAlmacen: seco, cantidad: 5 }],
    });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('quedan por devolver 4 L');
  });

  it('el formulario de reposición ofrece la devolución, al precio de la compra', async () => {
    const r = await request(app).get('/api/egresos/reponibles').set(cabecera(admin)).expect(200);

    const propia = r.body.find((d: { id: number }) => d.id === devolucion);
    expect(propia).toMatchObject({
      idCompra: compraF101,
      proveedor: 'Distribuidora Sur',
      observacion: 'Distribuidora Sur: llegó vencido',
    });
    expect(propia.lineas).toEqual([
      expect.objectContaining({ nombre: aceite.nombre, cantidad: 1, pendiente: 1, costoUnitario: 15 }),
    ]);
  });

  it('una reposición dice qué devolución repone: sin ella se rechaza', async () => {
    const r = await ingresar({
      motivo: 'Reposicion',
      insumos: [{ idIngrediente: aceite.id, idAlmacen: seco, cantidad: 1, costoUnitario: 15 }],
    });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('indica la devolución al proveedor que repone');
  });

  it('el proveedor lo repone: vuelve al precio de la compra y el costo del aceite no cambia', async () => {
    // Aunque se escriba otro precio: la reposición es lo que ya se había pagado.
    const r = await ingresar({
      motivo: 'Reposicion',
      idNotaEgreso: devolucion,
      insumos: [{ idIngrediente: aceite.id, idAlmacen: seco, cantidad: 1, costoUnitario: 20 }],
    });

    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      motivo: 'Reposicion',
      idDevolucion: devolucion,
      // El proveedor sale de la compra, si no se escribe.
      proveedor: 'Distribuidora Sur',
    });
    expect(r.body.lineas[0].costoUnitario).toBe(15);
    expect(await ficha(aceite.id)).toMatchObject({ stockTotal: 10, costoUnitario: 13.5 });
  });

  it('no se repone dos veces lo mismo', async () => {
    const r = await ingresar({
      motivo: 'Reposicion',
      idNotaEgreso: devolucion,
      insumos: [{ idIngrediente: aceite.id, idAlmacen: seco, cantidad: 1, costoUnitario: 15 }],
    });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('quedan por reponer 0');
    // Y ya no se ofrece para reponer.
    const reponibles = await request(app).get('/api/egresos/reponibles').set(cabecera(admin));
    expect(reponibles.body.some((d: { id: number }) => d.id === devolucion)).toBe(false);
  });

  it('un perecedero devuelto sale del lote de su compra, no del que vence antes', async () => {
    const yogur = await crearInsumo(`Yogur ${sufijo()}`, 'Litro', {
      tipoConservacion: 'Refrigerado',
      controlaVencimiento: true,
    });
    const comprar = async (codigoLote: string, dias: number, cantidad: number) =>
      (
        await ingresar({
          motivo: 'Compra',
          insumos: [
            {
              idIngrediente: yogur.id,
              idAlmacen: refrigerado,
              cantidad,
              costoUnitario: 9,
              codigoLote,
              fechaVencimiento: enDias(dias),
            },
          ],
        }).expect(201)
      ).body.id as number;
    const conLoteDañado = await comprar('Y-DAÑADO', 10, 4);
    await comprar('Y-PROXIMO', 3, 3);

    await egresar({
      motivo: 'Devolucion',
      idNotaIngreso: conLoteDañado,
      insumos: [{ idIngrediente: yogur.id, idAlmacen: refrigerado, cantidad: 2 }],
    }).expect(201);

    // Con el consumo común habría salido del Y-PROXIMO, que vence antes.
    const r = await lotes({ termino: yogur.nombre });
    const queda = Object.fromEntries(
      r.datos.map((l: { lote: { codigo: string; queda: number } }) => [l.lote.codigo, l.lote.queda]),
    );
    expect(queda).toEqual({ 'Y-DAÑADO': 2, 'Y-PROXIMO': 3 });
  });

  it('también se devuelve y se repone un producto comprado', async () => {
    const categoria = (await request(app).get('/api/catalogo/categorias')).body[0].id;
    const agua = (
      await request(app)
        .post('/api/productos')
        .set(cabecera(admin))
        .send({ nombre: `Agua ${sufijo()}`, precioVenta: 7, idCategoria: categoria })
        .expect(201)
    ).body.id;
    const compra = (
      await ingresar({
        motivo: 'Compra',
        proveedor: 'Embotelladora',
        productos: [{ idProducto: agua, idAlmacen: seco, cantidad: 10, costoUnitario: 4 }],
      }).expect(201)
    ).body.id;

    const salida = await egresar({
      motivo: 'Devolucion',
      idNotaIngreso: compra,
      productos: [{ idProducto: agua, idAlmacen: seco, cantidad: 2 }],
    }).expect(201);
    const vuelta = await ingresar({
      motivo: 'Reposicion',
      idNotaEgreso: salida.body.nota.id,
      productos: [{ idProducto: agua, idAlmacen: seco, cantidad: 2, costoUnitario: 0 }],
    }).expect(201);

    expect(vuelta.body.lineas[0]).toMatchObject({ cantidad: 2, costoUnitario: 4 });
    expect(vuelta.body.proveedor).toBe('Embotelladora');
  });
});

describe('Inventario › Lotes · por ítem', () => {
  it('cada entrada del aceite es un lote con el precio que se pagó', async () => {
    const r = await lotes({ termino: aceite.nombre });

    // De la más reciente a la más antigua.
    expect(r.datos.map((l: { motivo: string; costoUnitario: number }) => [l.motivo, l.costoUnitario])).toEqual([
      ['Reposicion', 15],
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
        costoMaximo: 15,
        costoUltimo: 15,
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

  it('filtra por rango de fechas', async () => {
    const d = new Date();
    const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    expect((await lotes({ termino: aceite.nombre, desde: hoy, hasta: hoy })).total).toBe(3);
    expect((await lotes({ termino: aceite.nombre, hasta: enDias(-1) })).total).toBe(0);
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
