import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { crearPedido, obtenerToken, registrarCliente, sufijo } from './ayudantes.js';

/**
 * Recorrido del inventario de punta a punta, con números que se pueden seguir
 * a mano (CU-INV-01 a CU-INV-06, CU-PRO-02, CU-VEN-01, CU-PED-01).
 *
 * Cada paso hace una operación real y comprueba lo que mueve: el stock del
 * almacén, el costo del insumo, el costo del producto y el reporte de
 * movimientos. Al final, el reporte tiene que cuadrar con lo que hay:
 * stock inicial (0) + entradas − salidas = existencia.
 *
 * Usa insumos y un producto propios, creados aquí, para que los números no
 * dependan de lo que hagan otras pruebas con el catálogo del seed. Los
 * almacenes sí son los del seed: un almacén seco más dejaba a las órdenes de
 * las pruebas siguientes sin poder deducir su destino (hay dos y ninguno es el
 * preferido), y todas respondían 409.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const enDias = (dias: number) => {
  const d = new Date(Date.now() + dias * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let admin = '';
let almacen = 0; // el almacén seco del seed
let refrigerado = 0; // la cámara del seed, para el perecedero
let harina = 0; // insumo seco, en kg, que no controla vencimiento
let leche = 0; // insumo perecedero, refrigerado
let pan = 0; // producto terminado
let receta = 0;

const ingresar = (cuerpo: object) =>
  request(app).post('/api/ingresos').set(cabecera(admin)).send(cuerpo);
const egresar = (cuerpo: object) =>
  request(app).post('/api/egresos').set(cabecera(admin)).send(cuerpo);
const fichaInsumo = async (id: number) =>
  (await request(app).get(`/api/insumos/${id}`).set(cabecera(admin))).body as {
    stockTotal: number;
    costoUnitario: number;
  };
const fichaProducto = async (id: number) =>
  (await request(app).get(`/api/productos/${id}`).set(cabecera(admin))).body as {
    stockTotal: number;
    costoPromedio: number | null;
  };
const reporte = async (filtro: Record<string, number>) =>
  (
    await request(app)
      .get('/api/reportes/inventario')
      .query({ desde: hoy(), hasta: hoy(), ...filtro })
      .set(cabecera(admin))
  ).body.porItem[0] as { entradas: number; salidas: number; neto: number; existencia: number };

beforeAll(async () => {
  admin = await obtenerToken();
  const s = sufijo();

  const almacenes = (await request(app).get('/api/almacenes').set(cabecera(admin))).body as {
    id: number;
    nombre: string;
  }[];
  almacen = almacenes.find((a) => a.nombre === 'Almacen Seco')!.id;
  refrigerado = almacenes.find((a) => a.nombre === 'Camara Refrigerada')!.id;

  const unidades = (await request(app).get('/api/insumos/unidades').set(cabecera(admin))).body as {
    id: number;
    nombre: string;
  }[];
  const kg = unidades.find((u) => u.nombre === 'Kilogramo')!.id;
  const litro = unidades.find((u) => u.nombre === 'Litro')!.id;

  harina = (
    await request(app)
      .post('/api/insumos')
      .set(cabecera(admin))
      .send({ nombre: `Harina ${s}`, idUnidad: kg, costoUnitario: 10, stockMinimo: 20, tipoConservacion: 'Seco' })
      .expect(201)
  ).body.id;
  leche = (
    await request(app)
      .post('/api/insumos')
      .set(cabecera(admin))
      .send({
        nombre: `Leche ${s}`,
        idUnidad: litro,
        costoUnitario: 5,
        stockMinimo: 0,
        tipoConservacion: 'Refrigerado',
        controlaVencimiento: true,
      })
      .expect(201)
  ).body.id;

  const categoria = (await request(app).get('/api/catalogo/categorias')).body[0].id as number;
  pan = (
    await request(app)
      .post('/api/productos')
      .set(cabecera(admin))
      .send({ nombre: `Pan ${s}`, precioVenta: 20, idCategoria: categoria, tipoConservacion: 'Seco' })
      .expect(201)
  ).body.id;
  // Una porción de pan lleva medio kilo de harina.
  receta = (
    await request(app)
      .post(`/api/productos/${pan}/recetas`)
      .set(cabecera(admin))
      .send({
        nombre: 'Receta del recorrido',
        rendimiento: 1,
        tiempoPreparacionMinutos: 10,
        activa: true,
        insumos: [{ idIngrediente: harina, cantidadRequerida: 0.5 }],
      })
      .expect(201)
  ).body.id;
});

describe('Recorrido del inventario · insumo seco (harina)', () => {
  it('1. Compra de 10 kg a Bs 10: entra al almacén y el costo es el de la compra', async () => {
    const r = await ingresar({
      motivo: 'Compra',
      proveedor: 'Molino San Luis',
      numeroDocumento: 'F-001',
      insumos: [{ idIngrediente: harina, idAlmacen: almacen, cantidad: 10, costoUnitario: 10 }],
    });
    expect(r.status).toBe(201);
    expect(r.body.total).toBe(100);

    expect(await fichaInsumo(harina)).toMatchObject({ stockTotal: 10, costoUnitario: 10 });
  });

  it('2. Otra compra de 10 kg a Bs 16: el costo pasa al promedio ponderado, Bs 13', async () => {
    await ingresar({
      motivo: 'Compra',
      insumos: [{ idIngrediente: harina, idAlmacen: almacen, cantidad: 10, costoUnitario: 16 }],
    }).expect(201);

    // (10 kg × Bs 10 + 10 kg × Bs 16) / 20 kg = Bs 13
    expect(await fichaInsumo(harina)).toMatchObject({ stockTotal: 20, costoUnitario: 13 });
  });

  it('3. Ajuste de +2 kg: suma la cantidad pero NO cambia el costo del insumo', async () => {
    await ingresar({
      motivo: 'Ajuste',
      insumos: [{ idIngrediente: harina, idAlmacen: almacen, cantidad: 2, costoUnitario: 50 }],
    }).expect(201);

    expect(await fichaInsumo(harina)).toMatchObject({ stockTotal: 22, costoUnitario: 13 });
  });

  it('4. Merma de 1 kg y ajuste de −1 kg: descuentan, y avisa al llegar al mínimo (20 kg)', async () => {
    const merma = await egresar({
      motivo: 'Merma',
      observacion: 'Bolsa rota',
      insumos: [{ idIngrediente: harina, idAlmacen: almacen, cantidad: 1 }],
    });
    expect(merma.status).toBe(201);
    expect(merma.body.alertas).toHaveLength(0); // quedan 21 kg: por encima del mínimo

    const ajuste = await egresar({
      motivo: 'Ajuste',
      observacion: 'Recuento del almacén',
      insumos: [{ idIngrediente: harina, idAlmacen: almacen, cantidad: 1 }],
    });
    expect(ajuste.status).toBe(201);
    // Quedan 20 kg: alcanzó el mínimo y el sistema lo avisa en la respuesta.
    expect(ajuste.body.alertas.map((a: { id: number }) => a.id)).toContain(harina);

    expect(await fichaInsumo(harina)).toMatchObject({ stockTotal: 20, costoUnitario: 13 });
  });

  it('5. Sacar más de lo que hay se rechaza entero y no toca nada', async () => {
    const r = await egresar({
      motivo: 'Merma',
      insumos: [{ idIngrediente: harina, idAlmacen: almacen, cantidad: 30 }],
    });

    expect(r.status).toBe(409);
    expect((await fichaInsumo(harina)).stockTotal).toBe(20);
  });
});

describe('Recorrido del inventario · producción, venta y pedido (pan)', () => {
  it('6. Una orden de 4 panes descuenta 2 kg de harina y suma 4 panes a Bs 6,50', async () => {
    const orden = await request(app)
      .post('/api/ordenes')
      .set(cabecera(admin))
      .send({ idReceta: receta, cantidad: 4 })
      .expect(201);
    await request(app).post(`/api/ordenes/${orden.body.id}/iniciar`).set(cabecera(admin)).expect(200);
    await request(app)
      .post(`/api/ordenes/${orden.body.id}/finalizar`)
      .set(cabecera(admin))
      .send({ idAlmacenDestino: almacen })
      .expect(200);

    // Egreso automático (motivo Producción): 4 × 0,5 kg = 2 kg de harina.
    expect((await fichaInsumo(harina)).stockTotal).toBe(18);
    // Ingreso automático (motivo Producción, documento OP-N): 4 panes, a
    // (2 kg × Bs 13) / 4 = Bs 6,50 cada uno.
    expect(await fichaProducto(pan)).toMatchObject({ stockTotal: 4, costoPromedio: 6.5 });
  });

  it('7. Vender 1 pan lo descuenta; anular la venta lo devuelve', async () => {
    const venta = await request(app)
      .post('/api/ventas')
      .set(cabecera(admin))
      .send({ tipoVenta: 'Mesa', metodoPago: 'Efectivo', items: [{ idProducto: pan, cantidad: 1 }] })
      .expect(201);
    expect((await fichaProducto(pan)).stockTotal).toBe(3);

    await request(app)
      .post(`/api/ventas/${venta.body.id}/anular`)
      .set(cabecera(admin))
      .send({ motivo: 'Recorrido de prueba' })
      .expect(200);
    expect((await fichaProducto(pan)).stockTotal).toBe(4);
  });

  it('8. Un pedido lo descuenta al hacerse; cancelarlo lo devuelve', async () => {
    const cliente = await registrarCliente();
    const nombre = (await request(app).get(`/api/productos/${pan}`).set(cabecera(admin))).body.nombre;

    const idPedido = await crearPedido(cliente.token, nombre);
    expect((await fichaProducto(pan)).stockTotal).toBe(3);

    await request(app)
      .post(`/api/pedidos/${idPedido}/cancelar`)
      .set(cabecera(cliente.token))
      .expect(200);
    expect((await fichaProducto(pan)).stockTotal).toBe(4);
  });

  it('9. Devolución de 1 pan y merma de 1 pan: mueven la cantidad, el costo sigue en Bs 6,50', async () => {
    await ingresar({
      motivo: 'Devolucion',
      productos: [{ idProducto: pan, idAlmacen: almacen, cantidad: 1, costoUnitario: 6.5 }],
    }).expect(201);
    await egresar({
      motivo: 'Merma',
      productos: [{ idProducto: pan, idAlmacen: almacen, cantidad: 1 }],
    }).expect(201);

    expect(await fichaProducto(pan)).toMatchObject({ stockTotal: 4, costoPromedio: 6.5 });
  });
});

describe('Recorrido del inventario · perecedero (leche) y reglas del almacén', () => {
  it('10. Un perecedero sin fecha de vencimiento no entra', async () => {
    const r = await ingresar({
      motivo: 'Compra',
      insumos: [{ idIngrediente: leche, idAlmacen: refrigerado, cantidad: 4, costoUnitario: 5 }],
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('vencimiento');
  });

  it('11. Un refrigerado no entra a un almacén seco', async () => {
    const r = await ingresar({
      motivo: 'Compra',
      insumos: [
        { idIngrediente: leche, idAlmacen: almacen, cantidad: 4, costoUnitario: 5, fechaVencimiento: enDias(10) },
      ],
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Conservación incompatible');
  });

  it('12. La merma sale primero del lote que vence antes (FEFO)', async () => {
    await ingresar({
      motivo: 'Compra',
      insumos: [
        { idIngrediente: leche, idAlmacen: refrigerado, cantidad: 4, costoUnitario: 5, codigoLote: 'L-LEJANO', fechaVencimiento: enDias(10) },
      ],
    }).expect(201);
    await ingresar({
      motivo: 'Compra',
      insumos: [
        { idIngrediente: leche, idAlmacen: refrigerado, cantidad: 3, costoUnitario: 5, codigoLote: 'L-PROXIMO', fechaVencimiento: enDias(3) },
      ],
    }).expect(201);

    await egresar({
      motivo: 'Merma',
      observacion: 'Se cortó',
      insumos: [{ idIngrediente: leche, idAlmacen: refrigerado, cantidad: 5 }],
    }).expect(201);

    // De 7 L quedan 2 L, y son del lote que vence más tarde.
    expect((await fichaInsumo(leche)).stockTotal).toBe(2);
    const lotes = (await request(app).get('/api/stock/vencimientos').query({ dias: 30 }).set(cabecera(admin)))
      .body as { insumo: string; codigo: string; stock: number }[];
    const nombre = (await request(app).get(`/api/insumos/${leche}`).set(cabecera(admin))).body.nombre;
    const propios = lotes.filter((l) => l.insumo === nombre);
    expect(propios).toEqual([expect.objectContaining({ codigo: 'L-LEJANO', stock: 2 })]);
  });
});

describe('Recorrido del inventario · el reporte cuadra con lo que hay', () => {
  it('13. Harina: entraron 22 kg, salieron 4 kg y hay 18 kg', async () => {
    const fila = await reporte({ idIngrediente: harina });

    // Entradas: compra 10 + compra 10 + ajuste 2. Salidas: merma 1 + ajuste 1 + producción 2.
    expect(fila).toMatchObject({ entradas: 22, salidas: 4, neto: 18, existencia: 18 });
  });

  it('14. Pan: la venta anulada y el pedido cancelado no cuentan como salida', async () => {
    const fila = await reporte({ idProducto: pan });

    // Entradas: producción 4 + devolución 1. Salidas: solo la merma de 1.
    expect(fila).toMatchObject({ entradas: 5, salidas: 1, neto: 4, existencia: 4 });
  });

  it('15. Leche: entraron 7 L, salieron 5 L y hay 2 L', async () => {
    expect(await reporte({ idIngrediente: leche })).toMatchObject({
      entradas: 7,
      salidas: 5,
      neto: 2,
      existencia: 2,
    });
  });
});
