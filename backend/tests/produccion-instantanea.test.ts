import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { obtenerToken, registrarCliente, sufijo } from './ayudantes.js';

/**
 * Producción al instante (extensión de CU-VEN-01).
 *
 * Escenario del mostrador: llegan clientes, no hay producto elaborado y hay que
 * hacerlo en el momento. Se produce **solo lo que falta** y todo ocurre en una
 * transacción: órdenes, notas de egreso e ingreso, y la venta.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

async function idAlmacen(token: string, nombre: string) {
  const r = await request(app).get('/api/almacenes').set(cabecera(token));
  return r.body.find((a: { nombre: string }) => a.nombre === nombre).id as number;
}

/** Producto seco con receta activa propia, para no depender de otras pruebas. */
async function prepararProducto(
  token: string,
  opciones: { divisible?: boolean; rendimiento?: number; cantidadInsumo?: number; stockInsumo?: number } = {},
) {
  const cab = cabecera(token);
  const {
    divisible = true,
    rendimiento = 1,
    cantidadInsumo = 2,
    stockInsumo = 100,
  } = opciones;

  const unidades = await request(app).get('/api/insumos/unidades').set(cab);
  const litro = unidades.body.find((u: { nombre: string }) => u.nombre === 'Litro');
  const seco = await idAlmacen(token, 'Almacen Seco');

  const insumo = await request(app)
    .post('/api/insumos')
    .set(cab)
    .send({
      nombre: `Insumo instantaneo ${sufijo()}`,
      idUnidad: litro.id,
      costoUnitario: 5,
      stockMinimo: 0,
      tipoConservacion: 'Seco',
    })
    .expect(201);

  await request(app)
    .post('/api/ingresos')
    .set(cab)
    .send({
      insumos: [
        { idIngrediente: insumo.body.id, idAlmacen: seco, cantidad: stockInsumo, costoUnitario: 5 },
      ],
    })
    .expect(201);

  const categorias = await request(app).get('/api/catalogo/categorias');
  const producto = await request(app)
    .post('/api/productos')
    .set(cab)
    .send({
      nombre: `Producto instantaneo ${sufijo()}`,
      precioVenta: 20,
      idCategoria: categorias.body[0].id,
      tipoConservacion: 'Seco',
    })
    .expect(201);

  await request(app)
    .post(`/api/productos/${producto.body.id}/recetas`)
    .set(cab)
    .send({
      nombre: 'Receta instantanea',
      rendimiento,
      tiempoPreparacionMinutos: 3,
      activa: true,
      insumos: [{ idIngrediente: insumo.body.id, cantidadRequerida: cantidadInsumo }],
    })
    .expect(201);

  // La receta divisible es el valor por omisión; solo se ajusta si no lo es.
  if (!divisible) {
    const recetas = await request(app)
      .get(`/api/productos/${producto.body.id}/recetas`)
      .set(cab);
    await request(app)
      .put(`/api/recetas/${recetas.body[0].id}`)
      .set(cab)
      .send({ divisible: false })
      .expect(200);
  }

  return { producto: producto.body, insumo: insumo.body, seco };
}

async function stockDeProducto(token: string, id: number) {
  const r = await request(app).get(`/api/productos/${id}`).set(cabecera(token));
  return r.body.stockTotal as number;
}

async function stockDeInsumo(token: string, nombre: string) {
  const r = await request(app).get('/api/insumos').query({ termino: nombre }).set(cabecera(token));
  return r.body[0].stockTotal as number;
}

describe('Evaluación previa de la venta', () => {
  it('informa que no hace falta producir cuando hay stock', async () => {
    const staff = await obtenerToken();
    const producto = await request(app)
      .get('/api/catalogo')
      .query({ termino: 'Galletas de avena' });

    const r = await request(app)
      .post('/api/ventas/evaluacion')
      .set(cabecera(staff))
      .send({ items: [{ idProducto: producto.body[0].id, cantidad: 1 }] });

    expect(r.status).toBe(200);
    expect(r.body.requiereProduccion).toBe(false);
    expect(r.body.puedeVenderse).toBe(true);
    expect(r.body.lineas[0].faltante).toBe(0);
  });

  it('calcula solo el faltante, no lo pedido', async () => {
    const staff = await obtenerToken();
    const { producto, seco } = await prepararProducto(staff);

    // Se dejan 2 unidades en stock con un ingreso directo.
    await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        productos: [{ idProducto: producto.id, idAlmacen: seco, cantidad: 2, costoUnitario: 10 }],
      })
      .expect(201);

    const r = await request(app)
      .post('/api/ventas/evaluacion')
      .set(cabecera(staff))
      .send({ items: [{ idProducto: producto.id, cantidad: 5 }] });

    expect(r.status).toBe(200);
    const linea = r.body.lineas[0];
    expect(linea.enStock).toBe(2);
    expect(linea.faltante).toBe(3);
    expect(linea.cantidadAProducir).toBe(3);
    // 3 porciones × 2 L × Bs 5
    expect(linea.costoProduccion).toBe(30);
    expect(linea.insumos).toHaveLength(1);
  });

  it('avisa cuando el producto no tiene receta activa', async () => {
    const staff = await obtenerToken();
    const categorias = await request(app).get('/api/catalogo/categorias');

    const sinReceta = await request(app)
      .post('/api/productos')
      .set(cabecera(staff))
      .send({
        nombre: `Reventa ${sufijo()}`,
        precioVenta: 12,
        idCategoria: categorias.body[0].id,
        tipoConservacion: 'Seco',
      })
      .expect(201);

    const r = await request(app)
      .post('/api/ventas/evaluacion')
      .set(cabecera(staff))
      .send({ items: [{ idProducto: sinReceta.body.id, cantidad: 1 }] });

    expect(r.status).toBe(200);
    expect(r.body.puedeVenderse).toBe(false);
    expect(r.body.lineas[0].producible).toBe(false);
    expect(r.body.lineas[0].motivo).toContain('receta activa');
  });

  it('redondea a corridas completas cuando la receta no es divisible', async () => {
    const staff = await obtenerToken();
    const { producto } = await prepararProducto(staff, {
      divisible: false,
      rendimiento: 4,
      cantidadInsumo: 1,
    });

    const r = await request(app)
      .post('/api/ventas/evaluacion')
      .set(cabecera(staff))
      .send({ items: [{ idProducto: producto.id, cantidad: 3 }] });

    // Una bandeja rinde 4: para 3 se hornea una completa y sobra 1.
    expect(r.body.lineas[0].cantidadAProducir).toBe(4);
    expect(r.body.lineas[0].excedente).toBe(1);
  });
});

describe('Venta con producción al instante', () => {
  it('produce lo que falta, vende y deja todo enlazado', async () => {
    const staff = await obtenerToken();
    const { producto, insumo } = await prepararProducto(staff);
    const insumoAntes = await stockDeInsumo(staff, insumo.nombre);

    const r = await request(app)
      .post('/api/ventas/con-produccion')
      .set(cabecera(staff))
      .send({
        tipoVenta: 'Mesa',
        metodoPago: 'Efectivo',
        items: [{ idProducto: producto.id, cantidad: 2 }],
      });

    expect(r.status).toBe(201);
    expect(r.body.venta.total).toBe(40);
    expect(r.body.producciones).toHaveLength(1);
    expect(r.body.producciones[0].cantidadProducida).toBe(2);
    expect(r.body.producciones[0].excedente).toBe(0);

    // Los insumos se consumieron: 2 porciones × 2 L.
    expect(await stockDeInsumo(staff, insumo.nombre)).toBe(insumoAntes - 4);

    // El producto entró y salió: queda en cero, no en dos.
    expect(await stockDeProducto(staff, producto.id)).toBe(0);

    // La orden quedó registrada como instantánea y finalizada, con sus notas.
    const orden = await request(app)
      .get(`/api/ordenes/${r.body.producciones[0].idOrden}`)
      .set(cabecera(staff));
    expect(orden.body.estado).toBe('Finalizada');
    expect(orden.body.notas.egreso).toBeTypeOf('number');
    expect(orden.body.notas.ingreso).toBeTypeOf('number');
  });

  it('produce únicamente el faltante cuando ya hay stock parcial', async () => {
    const staff = await obtenerToken();
    const { producto, insumo, seco } = await prepararProducto(staff);

    await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        productos: [{ idProducto: producto.id, idAlmacen: seco, cantidad: 2, costoUnitario: 10 }],
      })
      .expect(201);

    const insumoAntes = await stockDeInsumo(staff, insumo.nombre);

    const r = await request(app)
      .post('/api/ventas/con-produccion')
      .set(cabecera(staff))
      .send({
        metodoPago: 'Efectivo',
        items: [{ idProducto: producto.id, cantidad: 5 }],
      });

    expect(r.status).toBe(201);
    // Solo se elaboran 3, no 5.
    expect(r.body.producciones[0].cantidadProducida).toBe(3);
    expect(await stockDeInsumo(staff, insumo.nombre)).toBe(insumoAntes - 6);
    expect(await stockDeProducto(staff, producto.id)).toBe(0);
  });

  it('deja en inventario el excedente de una receta no divisible', async () => {
    const staff = await obtenerToken();
    const { producto } = await prepararProducto(staff, {
      divisible: false,
      rendimiento: 4,
      cantidadInsumo: 1,
    });

    const r = await request(app)
      .post('/api/ventas/con-produccion')
      .set(cabecera(staff))
      .send({
        metodoPago: 'Efectivo',
        items: [{ idProducto: producto.id, cantidad: 3 }],
      });

    expect(r.status).toBe(201);
    expect(r.body.producciones[0].cantidadProducida).toBe(4);
    expect(r.body.producciones[0].excedente).toBe(1);
    // Se hornearon 4, se vendieron 3: queda 1 disponible.
    expect(await stockDeProducto(staff, producto.id)).toBe(1);
  });

  it('no produce nada si ya hay stock suficiente', async () => {
    const staff = await obtenerToken();
    const { producto, insumo, seco } = await prepararProducto(staff);

    await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        productos: [{ idProducto: producto.id, idAlmacen: seco, cantidad: 3, costoUnitario: 10 }],
      })
      .expect(201);

    const insumoAntes = await stockDeInsumo(staff, insumo.nombre);

    const r = await request(app)
      .post('/api/ventas/con-produccion')
      .set(cabecera(staff))
      .send({
        metodoPago: 'Efectivo',
        items: [{ idProducto: producto.id, cantidad: 2 }],
      });

    expect(r.status).toBe(201);
    expect(r.body.producciones).toHaveLength(0);
    expect(await stockDeInsumo(staff, insumo.nombre)).toBe(insumoAntes);
  });

  it('revierte todo si los insumos no alcanzan', async () => {
    const staff = await obtenerToken();
    const { producto, insumo } = await prepararProducto(staff, { stockInsumo: 3 });

    const ventasAntes = await request(app).get('/api/ventas').set(cabecera(staff));
    const ordenesAntes = await request(app).get('/api/ordenes').set(cabecera(staff));

    // 5 porciones × 2 L = 10 L, y solo hay 3.
    const r = await request(app)
      .post('/api/ventas/con-produccion')
      .set(cabecera(staff))
      .send({
        metodoPago: 'Efectivo',
        items: [{ idProducto: producto.id, cantidad: 5 }],
      });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Insumos insuficientes');

    // Ni venta, ni orden, ni consumo de insumos.
    const ventasDespues = await request(app).get('/api/ventas').set(cabecera(staff));
    const ordenesDespues = await request(app).get('/api/ordenes').set(cabecera(staff));
    // Se comparan los totales y no las páginas: la página solo trae las
    // primeras, y lo que se verifica es que no se creó ninguna fila.
    expect(ventasDespues.body.total).toBe(ventasAntes.body.total);
    expect(ordenesDespues.body.total).toBe(ordenesAntes.body.total);
    expect(await stockDeInsumo(staff, insumo.nombre)).toBe(3);
  });

  it('rechaza producir un producto sin receta activa', async () => {
    const staff = await obtenerToken();
    const categorias = await request(app).get('/api/catalogo/categorias');

    const sinReceta = await request(app)
      .post('/api/productos')
      .set(cabecera(staff))
      .send({
        nombre: `Reventa ${sufijo()}`,
        precioVenta: 12,
        idCategoria: categorias.body[0].id,
        tipoConservacion: 'Seco',
      })
      .expect(201);

    const r = await request(app)
      .post('/api/ventas/con-produccion')
      .set(cabecera(staff))
      .send({
        metodoPago: 'Efectivo',
        items: [{ idProducto: sinReceta.body.id, cantidad: 1 }],
      });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('receta activa');
  });

  it('un cliente no puede producir ni vender', async () => {
    const cliente = await registrarCliente();
    const r = await request(app)
      .post('/api/ventas/con-produccion')
      .set(cabecera(cliente.token))
      .send({ metodoPago: 'Efectivo', items: [{ idProducto: 1, cantidad: 1 }] });

    expect(r.status).toBe(403);
  });
});

describe('Almacén de destino de la producción al instante', () => {
  it('pide elegir almacén cuando hay más de uno compatible y respeta la elección', async () => {
    const staff = await obtenerToken();
    const cab = cabecera(staff);
    const { producto } = await prepararProducto(staff);

    // Un segundo almacén seco vuelve ambiguo el destino del producto terminado.
    const segundo = await request(app)
      .post('/api/almacenes')
      .set(cab)
      .send({ nombre: `Seco auxiliar ${sufijo()}`, tipoConservacion: 'Seco' })
      .expect(201);

    const evaluacion = await request(app)
      .post('/api/ventas/evaluacion')
      .set(cab)
      .send({ items: [{ idProducto: producto.id, cantidad: 2 }] })
      .expect(200);

    const linea = evaluacion.body.lineas[0];
    expect(linea.requiereElegirAlmacen).toBe(true);
    expect(linea.almacenesCompatibles.length).toBeGreaterThan(1);

    // Sin indicar destino el sistema no elige por su cuenta.
    const sinDestino = await request(app)
      .post('/api/ventas/con-produccion')
      .set(cab)
      .send({ metodoPago: 'Efectivo', items: [{ idProducto: producto.id, cantidad: 2 }] });
    expect(sinDestino.status).toBe(409);
    expect(sinDestino.body.error).toContain('Indique el almacén de destino');

    // Con el destino indicado la venta sale adelante. Se dirige al almacén
    // habitual y no al auxiliar: así este queda sin existencias y puede
    // retirarse al terminar, sin dejar ambigüedad para las demás pruebas.
    const habitual = await idAlmacen(staff, 'Almacen Seco');
    const conDestino = await request(app)
      .post('/api/ventas/con-produccion')
      .set(cab)
      .send({
        metodoPago: 'Efectivo',
        items: [{ idProducto: producto.id, cantidad: 2 }],
        destinos: [{ idProducto: producto.id, idAlmacen: habitual }],
      });
    expect(conDestino.status).toBe(201);

    // Se retira el auxiliar: mientras exista, ningún producto seco tiene un
    // destino deducible y la deducción automática dejaría de poder probarse.
    await request(app).delete(`/api/almacenes/${segundo.body.id}`).set(cab).expect(204);
  });

  it('rechaza un almacén que no admite la conservación del producto', async () => {
    const staff = await obtenerToken();
    const { producto } = await prepararProducto(staff);
    const refrigerado = await idAlmacen(staff, 'Camara Refrigerada');

    const r = await request(app)
      .post('/api/ventas/con-produccion')
      .set(cabecera(staff))
      .send({
        metodoPago: 'Efectivo',
        items: [{ idProducto: producto.id, cantidad: 1 }],
        destinos: [{ idProducto: producto.id, idAlmacen: refrigerado }],
      });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('no admite productos de conservación Seco');
  });
});

describe('La evaluación previa promete lo mismo que la ejecución', () => {
  /**
   * Antes, la evaluación solo miraba receta y almacén: anunciaba "se preparará
   * al instante", listaba los insumos, habilitaba el botón, y recién al
   * confirmar fallaba con "insumos insuficientes".
   */
  it('avisa de los insumos que no alcanzan, sin llegar a confirmar', async () => {
    const staff = await obtenerToken();
    // 5 porciones × 2 L = 10 L, y solo hay 3.
    const { producto, insumo } = await prepararProducto(staff, { stockInsumo: 3 });

    const evaluacion = await request(app)
      .post('/api/ventas/evaluacion')
      .set(cabecera(staff))
      .send({ items: [{ idProducto: producto.id, cantidad: 5 }] })
      .expect(200);

    const linea = evaluacion.body.lineas[0];
    expect(linea.producible).toBe(false);
    expect(evaluacion.body.puedeVenderse).toBe(false);
    expect(linea.motivo).toContain('Insumos insuficientes');
    expect(linea.insumosFaltantes).toHaveLength(1);
    expect(linea.insumosFaltantes[0].nombre).toBe(insumo.nombre);
    expect(linea.insumosFaltantes[0].disponible).toBe(3);
    expect(linea.insumosFaltantes[0].requerido).toBe(10);

    // Y la ejecución coincide con lo anunciado.
    const venta = await request(app)
      .post('/api/ventas/con-produccion')
      .set(cabecera(staff))
      .send({ metodoPago: 'Efectivo', items: [{ idProducto: producto.id, cantidad: 5 }] });
    expect(venta.status).toBe(409);
  });

  /**
   * Cada línea se simula contra el stock completo, de modo que dos productos
   * que comparten un insumo pueden parecer producibles por separado y no
   * serlo juntos.
   */
  it('detecta el insumo que alcanza para un producto pero no para los dos', async () => {
    const staff = await obtenerToken();
    const cab = cabecera(staff);

    // Un insumo con 6 L; cada producto necesita 4 L para una unidad.
    const { producto: primero, insumo } = await prepararProducto(staff, {
      cantidadInsumo: 4,
      stockInsumo: 6,
    });

    const categorias = await request(app).get('/api/catalogo/categorias');
    const segundo = await request(app)
      .post('/api/productos')
      .set(cab)
      .send({
        nombre: `Comparte insumo ${sufijo()}`,
        precioVenta: 20,
        idCategoria: categorias.body[0].id,
        tipoConservacion: 'Seco',
      })
      .expect(201);

    await request(app)
      .post(`/api/productos/${segundo.body.id}/recetas`)
      .set(cab)
      .send({
        nombre: 'Receta que comparte',
        rendimiento: 1,
        tiempoPreparacionMinutos: 3,
        activa: true,
        insumos: [{ idIngrediente: insumo.id, cantidadRequerida: 4 }],
      })
      .expect(201);

    // Por separado, cualquiera de los dos es producible: 4 ≤ 6.
    const solo = await request(app)
      .post('/api/ventas/evaluacion')
      .set(cab)
      .send({ items: [{ idProducto: primero.id, cantidad: 1 }] })
      .expect(200);
    expect(solo.body.puedeVenderse).toBe(true);

    // Juntos hacen falta 8 L y solo hay 6.
    const ambos = await request(app)
      .post('/api/ventas/evaluacion')
      .set(cab)
      .send({
        items: [
          { idProducto: primero.id, cantidad: 1 },
          { idProducto: segundo.body.id, cantidad: 1 },
        ],
      })
      .expect(200);

    expect(ambos.body.puedeVenderse).toBe(false);
    expect(ambos.body.insumosFaltantes).toHaveLength(1);
    expect(ambos.body.insumosFaltantes[0].requerido).toBe(8);
    expect(ambos.body.insumosFaltantes[0].disponible).toBe(6);
  });
});

describe('El excedente de producción queda en inventario', () => {
  /**
   * La pregunta directa: si la receta obliga a producir de más, ¿esas unidades
   * se pierden o quedan disponibles para la próxima venta?
   */
  it('el excedente queda con su costo y puede venderse después sin producir', async () => {
    const staff = await obtenerToken();
    const { producto } = await prepararProducto(staff, {
      divisible: false,
      rendimiento: 5,
      cantidadInsumo: 1,
    });

    // Piden 2, la bandeja rinde 5: se elaboran 5 y sobran 3.
    const primera = await request(app)
      .post('/api/ventas/con-produccion')
      .set(cabecera(staff))
      .send({ metodoPago: 'Efectivo', items: [{ idProducto: producto.id, cantidad: 2 }] });

    expect(primera.status).toBe(201);
    expect(primera.body.producciones[0].cantidadProducida).toBe(5);
    expect(primera.body.producciones[0].excedente).toBe(3);
    expect(await stockDeProducto(staff, producto.id)).toBe(3);

    // La venta siguiente sale del excedente: no vuelve a producir nada.
    const segunda = await request(app)
      .post('/api/ventas/con-produccion')
      .set(cabecera(staff))
      .send({ metodoPago: 'Efectivo', items: [{ idProducto: producto.id, cantidad: 3 }] });

    expect(segunda.status).toBe(201);
    expect(segunda.body.producciones).toHaveLength(0);
    expect(await stockDeProducto(staff, producto.id)).toBe(0);
  });
});
