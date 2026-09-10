import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { obtenerToken, registrarCliente, sufijo } from './ayudantes.js';

/**
 * Etapa 5: CU-PRO-02 Gestionar Orden de Producción, con CU-PRO-04 Cancelar
 * Orden de Producción como extensión.
 *
 * La receta de referencia es la del seed para "Barra de avena y almendras":
 * rendimiento 4 porciones, con 0.24 kg de avena, 0.08 kg de almendras y
 * 0.12 kg de harina integral.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

async function idRecetaDe(token: string, nombreProducto: string) {
  const productos = await request(app)
    .get('/api/productos')
    .query({ termino: nombreProducto })
    .set(cabecera(token));
  const recetas = await request(app)
    .get(`/api/productos/${productos.body[0].id}/recetas`)
    .set(cabecera(token));
  return recetas.body.find((r: { activa: boolean }) => r.activa).id as number;
}

async function stockDeInsumo(token: string, termino: string) {
  const r = await request(app).get('/api/insumos').query({ termino }).set(cabecera(token));
  return r.body[0].stockTotal as number;
}

async function stockDeProducto(token: string, termino: string) {
  const r = await request(app).get('/api/productos').query({ termino }).set(cabecera(token));
  return r.body[0].stockTotal as number;
}

async function crearOrden(token: string, idReceta: number, cantidad: number) {
  return request(app).post('/api/ordenes').set(cabecera(token)).send({ idReceta, cantidad });
}

describe('CU-PRO-02 Planificación de la orden', () => {
  it('calcula los insumos dividiendo entre el rendimiento', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');

    // 8 porciones sobre un rendimiento de 4 duplican cada cantidad requerida.
    const r = await crearOrden(staff, idReceta, 8);

    expect(r.status).toBe(201);
    expect(r.body.estado).toBe('Pendiente');
    expect(r.body.receta.rendimiento).toBe(4);
    expect(r.body.producto.nombre).toBe('Barra de avena y almendras');

    const porNombre = new Map(
      r.body.insumosRequeridos.map((i: { nombre: string; cantidadRequerida: number }) => [
        i.nombre,
        i.cantidadRequerida,
      ]),
    );
    expect(porNombre.get('Avena en hojuelas')).toBe(0.48);
    expect(porNombre.get('Almendras')).toBe(0.16);
    expect(porNombre.get('Harina integral')).toBe(0.24);
  });

  it('calcula el costo de la corrida a partir del costo de los insumos', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');

    const r = await crearOrden(staff, idReceta, 4);

    // 0.24 x 14 + 0.08 x 65 + 0.12 x 11 = 3.36 + 5.20 + 1.32
    expect(r.status).toBe(201);
    expect(r.body.costoEstimado).toBe(9.88);
  });

  it('impide crear la orden si faltan insumos e informa cuál y cuánto', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');
    const antes = await request(app).get('/api/ordenes').set(cabecera(staff));

    const r = await crearOrden(staff, idReceta, 100000);

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Insumos insuficientes');
    expect(r.body.error).toContain('Almendras');
    expect(r.body.error).toContain('faltan');

    // La orden no llega a registrarse.
    const despues = await request(app).get('/api/ordenes').set(cabecera(staff));
    expect(despues.body.total).toBe(antes.body.total);
  });

  it('solo permite producir a partir de la receta activa', async () => {
    const staff = await obtenerToken();
    const productos = await request(app)
      .get('/api/productos')
      .query({ termino: 'Barra de avena' })
      .set(cabecera(staff));

    const inactiva = await request(app)
      .post(`/api/productos/${productos.body[0].id}/recetas`)
      .set(cabecera(staff))
      .send({
        nombre: 'Version en borrador',
        rendimiento: 2,
        tiempoPreparacionMinutos: 10,
        insumos: [{ idIngrediente: 1, cantidadRequerida: 0.1 }],
      })
      .expect(201);

    const r = await crearOrden(staff, inactiva.body.id, 2);

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('receta activa');
  });

  it('rechaza una receta inexistente', async () => {
    const staff = await obtenerToken();
    const r = await crearOrden(staff, 999999, 1);
    expect(r.status).toBe(404);
  });

  it('rechaza una cantidad igual a cero', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');

    const r = await crearOrden(staff, idReceta, 0);

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('mayor a cero');
  });

  it('un cliente no puede gestionar órdenes de producción', async () => {
    const cliente = await registrarCliente();
    const r = await request(app).get('/api/ordenes').set(cabecera(cliente.token));
    expect(r.status).toBe(403);
  });
});

describe('CU-PRO-02 Ejecución de la orden', () => {
  it('avanza Pendiente → En proceso → Finalizada', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');
    const orden = await crearOrden(staff, idReceta, 4);

    expect(orden.body.transicionesPosibles).toEqual(['En proceso']);

    const enProceso = await request(app)
      .post(`/api/ordenes/${orden.body.id}/iniciar`)
      .set(cabecera(staff));
    expect(enProceso.status).toBe(200);
    expect(enProceso.body.estado).toBe('En proceso');
    expect(enProceso.body.transicionesPosibles).toEqual(['Finalizada']);

    const finalizada = await request(app)
      .post(`/api/ordenes/${orden.body.id}/finalizar`)
      .set(cabecera(staff))
      .send({});
    expect(finalizada.status).toBe(200);
    expect(finalizada.body.estado).toBe('Finalizada');
    expect(finalizada.body.fechaFinalizacion).not.toBeNull();
    expect(finalizada.body.transicionesPosibles).toEqual([]);
  });

  it('no permite finalizar una orden que no fue iniciada', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');
    const orden = await crearOrden(staff, idReceta, 4);

    const r = await request(app)
      .post(`/api/ordenes/${orden.body.id}/finalizar`)
      .set(cabecera(staff))
      .send({});

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Pendiente');
  });

  it('al finalizar genera ambas notas, las enlaza y mueve los dos stocks', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');

    const avenaAntes = await stockDeInsumo(staff, 'Avena');
    const almendrasAntes = await stockDeInsumo(staff, 'Almendras');
    const harinaAntes = await stockDeInsumo(staff, 'Harina');
    const productoAntes = await stockDeProducto(staff, 'Barra de avena');

    const orden = await crearOrden(staff, idReceta, 4);
    await request(app).post(`/api/ordenes/${orden.body.id}/iniciar`).set(cabecera(staff)).expect(200);

    const r = await request(app)
      .post(`/api/ordenes/${orden.body.id}/finalizar`)
      .set(cabecera(staff))
      .send({});

    expect(r.status).toBe(200);
    expect(r.body.notas.egreso).toBeTypeOf('number');
    expect(r.body.notas.ingreso).toBeTypeOf('number');

    // Los insumos se consumieron.
    expect(await stockDeInsumo(staff, 'Avena')).toBe(Math.round((avenaAntes - 0.24) * 100) / 100);
    expect(await stockDeInsumo(staff, 'Almendras')).toBe(
      Math.round((almendrasAntes - 0.08) * 100) / 100,
    );
    expect(await stockDeInsumo(staff, 'Harina')).toBe(
      Math.round((harinaAntes - 0.12) * 100) / 100,
    );

    // El producto terminado ingresó.
    expect(await stockDeProducto(staff, 'Barra de avena')).toBe(productoAntes + 4);

    // Ambas notas llevan motivo Producción y quedan enlazadas a la orden.
    const egreso = await request(app)
      .get(`/api/egresos/${r.body.notas.egreso}`)
      .set(cabecera(staff));
    expect(egreso.body.motivo).toBe('Produccion');
    expect(egreso.body.observacion).toContain(`${orden.body.id}`);
    expect(egreso.body.lineas).toHaveLength(3);

    const ingreso = await request(app)
      .get(`/api/ingresos/${r.body.notas.ingreso}`)
      .set(cabecera(staff));
    expect(ingreso.body.motivo).toBe('Produccion');
    expect(ingreso.body.numeroDocumento).toBe(`OP-${orden.body.id}`);
    expect(ingreso.body.lineas).toHaveLength(1);
    // Costo de la corrida repartido entre las porciones: 9.88 / 4
    expect(ingreso.body.lineas[0].costoUnitario).toBe(2.47);
  });

  it('deduce el almacén de destino por la conservación del producto', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');
    const orden = await crearOrden(staff, idReceta, 4);

    await request(app).post(`/api/ordenes/${orden.body.id}/iniciar`).set(cabecera(staff)).expect(200);
    const r = await request(app)
      .post(`/api/ordenes/${orden.body.id}/finalizar`)
      .set(cabecera(staff))
      .send({});

    expect(r.status).toBe(200);

    const ingreso = await request(app)
      .get(`/api/ingresos/${r.body.notas.ingreso}`)
      .set(cabecera(staff));
    expect(ingreso.body.lineas[0].almacen).toBe('Almacen Seco');
  });

  it('rechaza un almacén de destino incompatible con la conservación', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');
    const almacenes = await request(app).get('/api/almacenes').set(cabecera(staff));
    const refrigerada = almacenes.body.find(
      (a: { nombre: string }) => a.nombre === 'Camara Refrigerada',
    );

    const orden = await crearOrden(staff, idReceta, 4);
    await request(app).post(`/api/ordenes/${orden.body.id}/iniciar`).set(cabecera(staff)).expect(200);

    const r = await request(app)
      .post(`/api/ordenes/${orden.body.id}/finalizar`)
      .set(cabecera(staff))
      .send({ idAlmacenDestino: refrigerada.id });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('no admite productos de conservación Seco');
  });

  it('no permite iniciar dos veces la misma orden', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');
    const orden = await crearOrden(staff, idReceta, 4);

    await request(app).post(`/api/ordenes/${orden.body.id}/iniciar`).set(cabecera(staff)).expect(200);
    const r = await request(app)
      .post(`/api/ordenes/${orden.body.id}/iniciar`)
      .set(cabecera(staff));

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('En proceso');
  });

  it('filtra el listado por estado', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .get('/api/ordenes')
      .query({ estado: 'Finalizada' })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.datos.length).toBeGreaterThan(0);
    for (const orden of r.body.datos) expect(orden.estado).toBe('Finalizada');
  });
});

describe('CU-PRO-02 · Destino cuando hay varios almacenes compatibles', () => {
  /**
   * Escenario real: al crear un segundo almacén refrigerado, el sistema deja
   * de poder deducir el destino del producto terminado y debe pedirlo. La
   * interfaz solo ofrece los compatibles, de modo que la elección siempre es
   * válida.
   */
  it('pide el almacén cuando hay ambigüedad y lo acepta cuando se indica', async () => {
    const staff = await obtenerToken();
    const cabecera = { Authorization: `Bearer ${staff}` };

    const segundo = await request(app)
      .post('/api/almacenes')
      .set(cabecera)
      .send({ nombre: `Refrigerado extra ${sufijo()}`, tipoConservacion: 'Refrigerado' })
      .expect(201);

    try {
      const idReceta = await idRecetaDe(staff, 'Ensalada Cesar');
      const orden = await crearOrden(staff, idReceta, 1);
      expect(orden.body.producto.tipoConservacion).toBe('Refrigerado');

      await request(app)
        .post(`/api/ordenes/${orden.body.id}/iniciar`)
        .set(cabecera)
        .expect(200);

      // Sin destino explícito no puede resolverse: hay dos compatibles.
      const sinDestino = await request(app)
        .post(`/api/ordenes/${orden.body.id}/finalizar`)
        .set(cabecera)
        .send({});

      expect(sinDestino.status).toBe(409);
      expect(sinDestino.body.error).toContain('Indique el almacén de destino');

      // Con el destino indicado, la orden se cierra.
      const conDestino = await request(app)
        .post(`/api/ordenes/${orden.body.id}/finalizar`)
        .set(cabecera)
        .send({ idAlmacenDestino: segundo.body.id });

      expect(conDestino.status).toBe(200);
      expect(conDestino.body.estado).toBe('Finalizada');
      expect(conDestino.body.notas.ingreso).toBeTypeOf('number');
    } finally {
      // El almacén de prueba se retira para no dejar ambigüedad a otras suites.
      await request(app).delete(`/api/almacenes/${segundo.body.id}`).set(cabecera);
    }
  });

  it('rechaza un almacén incompatible con la conservación del producto', async () => {
    const staff = await obtenerToken();
    const cabecera = { Authorization: `Bearer ${staff}` };

    const almacenes = await request(app).get('/api/almacenes').set(cabecera);
    const seco = almacenes.body.find((a: { nombre: string }) => a.nombre === 'Almacen Seco');

    const idReceta = await idRecetaDe(staff, 'Ensalada Cesar');
    const orden = await crearOrden(staff, idReceta, 1);
    await request(app).post(`/api/ordenes/${orden.body.id}/iniciar`).set(cabecera).expect(200);

    const r = await request(app)
      .post(`/api/ordenes/${orden.body.id}/finalizar`)
      .set(cabecera)
      .send({ idAlmacenDestino: seco.id });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('no admite productos de conservación Refrigerado');
  });
});


describe('CU-PRO-02 · La verificación de insumos al ejecutar', () => {
  /**
   * Escenario que motiva las dos comprobaciones (hallazgo V4).
   *
   * Una orden puede pasar días en estado Pendiente. Entre planificarla y
   * ejecutarla, otra operación —una merma, otra orden, una venta— consume los
   * mismos insumos. La comprobación del alta ya no dice nada útil: la que
   * decide es la del cierre.
   */
  it('impide finalizar cuando los insumos se consumieron después de planificar', async () => {
    const staff = await obtenerToken();
    const cab = cabecera(staff);

    // Insumo propio, para que ninguna otra prueba altere sus existencias.
    const unidades = await request(app).get('/api/insumos/unidades').set(cab);
    const kg = unidades.body.find((u: { nombre: string }) => u.nombre === 'Kilogramo');
    const almacenes = await request(app).get('/api/almacenes').set(cab);
    const seco = almacenes.body.find((a: { nombre: string }) => a.nombre === 'Almacen Seco');

    const insumo = await request(app)
      .post('/api/insumos')
      .set(cab)
      .send({
        nombre: `Insumo carrera ${sufijo()}`,
        idUnidad: kg.id,
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
          { idIngrediente: insumo.body.id, idAlmacen: seco.id, cantidad: 10, costoUnitario: 5 },
        ],
      })
      .expect(201);

    const categorias = await request(app).get('/api/catalogo/categorias');
    const producto = await request(app)
      .post('/api/productos')
      .set(cab)
      .send({
        nombre: `Producto carrera ${sufijo()}`,
        precioVenta: 20,
        idCategoria: categorias.body[0].id,
        tipoConservacion: 'Seco',
      })
      .expect(201);

    const receta = await request(app)
      .post(`/api/productos/${producto.body.id}/recetas`)
      .set(cab)
      .send({
        nombre: 'Receta de la prueba',
        rendimiento: 1,
        tiempoPreparacionMinutos: 5,
        activa: true,
        insumos: [{ idIngrediente: insumo.body.id, cantidadRequerida: 4 }],
      })
      .expect(201);

    // 2 porciones × 4 kg = 8 kg. Con 10 kg disponibles, el alta pasa.
    const orden = await crearOrden(staff, receta.body.id, 2);
    expect(orden.status).toBe(201);

    await request(app).post(`/api/ordenes/${orden.body.id}/iniciar`).set(cab).expect(200);

    // Otra operación se lleva 5 kg: quedan 5, y la orden necesita 8.
    await request(app)
      .post('/api/egresos')
      .set(cab)
      .send({
        motivo: 'Merma',
        insumos: [{ idIngrediente: insumo.body.id, idAlmacen: seco.id, cantidad: 5 }],
      })
      .expect(201);

    const r = await request(app)
      .post(`/api/ordenes/${orden.body.id}/finalizar`)
      .set(cab)
      .send({ idAlmacenDestino: seco.id });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Insumos insuficientes');
    expect(r.body.error).toContain('disponible 5');

    // Nada quedó a medias: ni notas, ni cambio de estado, ni stock alterado.
    const despues = await request(app).get(`/api/ordenes/${orden.body.id}`).set(cab);
    expect(despues.body.estado).toBe('En proceso');
    expect(despues.body.notas.egreso).toBeNull();
    expect(despues.body.notas.ingreso).toBeNull();

    const stock = await request(app)
      .get('/api/insumos')
      .query({ termino: insumo.body.nombre })
      .set(cab);
    expect(stock.body[0].stockTotal).toBe(5);
  });

  it('permite finalizar en cuanto los insumos vuelven a alcanzar', async () => {
    const staff = await obtenerToken();
    const cab = cabecera(staff);

    const unidades = await request(app).get('/api/insumos/unidades').set(cab);
    const kg = unidades.body.find((u: { nombre: string }) => u.nombre === 'Kilogramo');
    const almacenes = await request(app).get('/api/almacenes').set(cab);
    const seco = almacenes.body.find((a: { nombre: string }) => a.nombre === 'Almacen Seco');

    const insumo = await request(app)
      .post('/api/insumos')
      .set(cab)
      .send({
        nombre: `Insumo repuesto ${sufijo()}`,
        idUnidad: kg.id,
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
          { idIngrediente: insumo.body.id, idAlmacen: seco.id, cantidad: 3, costoUnitario: 5 },
        ],
      })
      .expect(201);

    const categorias = await request(app).get('/api/catalogo/categorias');
    const producto = await request(app)
      .post('/api/productos')
      .set(cab)
      .send({
        nombre: `Producto repuesto ${sufijo()}`,
        precioVenta: 20,
        idCategoria: categorias.body[0].id,
        tipoConservacion: 'Seco',
      })
      .expect(201);

    const receta = await request(app)
      .post(`/api/productos/${producto.body.id}/recetas`)
      .set(cab)
      .send({
        nombre: 'Receta repuesta',
        rendimiento: 1,
        tiempoPreparacionMinutos: 5,
        activa: true,
        insumos: [{ idIngrediente: insumo.body.id, cantidadRequerida: 3 }],
      })
      .expect(201);

    const orden = await crearOrden(staff, receta.body.id, 1);
    await request(app).post(`/api/ordenes/${orden.body.id}/iniciar`).set(cab).expect(200);

    // Se agota el insumo y la finalización se bloquea.
    await request(app)
      .post('/api/egresos')
      .set(cab)
      .send({
        motivo: 'Merma',
        insumos: [{ idIngrediente: insumo.body.id, idAlmacen: seco.id, cantidad: 3 }],
      })
      .expect(201);

    await request(app)
      .post(`/api/ordenes/${orden.body.id}/finalizar`)
      .set(cab)
      .send({ idAlmacenDestino: seco.id })
      .expect(409);

    // Se repone y la misma orden cierra sin necesidad de rehacerla.
    await request(app)
      .post('/api/ingresos')
      .set(cab)
      .send({
        insumos: [
          { idIngrediente: insumo.body.id, idAlmacen: seco.id, cantidad: 3, costoUnitario: 5 },
        ],
      })
      .expect(201);

    const r = await request(app)
      .post(`/api/ordenes/${orden.body.id}/finalizar`)
      .set(cab)
      .send({ idAlmacenDestino: seco.id });

    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('Finalizada');
  });
});

describe('CU-PRO-04 Cancelar orden de producción', () => {
  it('cancela una orden pendiente sin generar notas ni mover stock', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');
    const avenaAntes = await stockDeInsumo(staff, 'Avena');

    const orden = await crearOrden(staff, idReceta, 4);
    expect(orden.body.cancelable).toBe(true);

    const r = await request(app)
      .post(`/api/ordenes/${orden.body.id}/cancelar`)
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('Cancelada');
    expect(r.body.cancelable).toBe(false);
    expect(r.body.notas.egreso).toBeNull();
    expect(r.body.notas.ingreso).toBeNull();
    expect(await stockDeInsumo(staff, 'Avena')).toBe(avenaAntes);
  });

  it('cancela una orden en proceso', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');
    const orden = await crearOrden(staff, idReceta, 4);

    await request(app).post(`/api/ordenes/${orden.body.id}/iniciar`).set(cabecera(staff)).expect(200);
    const r = await request(app)
      .post(`/api/ordenes/${orden.body.id}/cancelar`)
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('Cancelada');
  });

  it('no cancela una orden ya finalizada', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');
    const orden = await crearOrden(staff, idReceta, 4);

    await request(app).post(`/api/ordenes/${orden.body.id}/iniciar`).set(cabecera(staff)).expect(200);
    await request(app)
      .post(`/api/ordenes/${orden.body.id}/finalizar`)
      .set(cabecera(staff))
      .send({})
      .expect(200);

    const r = await request(app)
      .post(`/api/ordenes/${orden.body.id}/cancelar`)
      .set(cabecera(staff));

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Finalizada');
  });

  it('una orden cancelada ya no puede avanzar', async () => {
    const staff = await obtenerToken();
    const idReceta = await idRecetaDe(staff, 'Barra de avena');
    const orden = await crearOrden(staff, idReceta, 4);

    await request(app)
      .post(`/api/ordenes/${orden.body.id}/cancelar`)
      .set(cabecera(staff))
      .expect(200);

    const r = await request(app)
      .post(`/api/ordenes/${orden.body.id}/iniciar`)
      .set(cabecera(staff));

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Cancelada');
  });
});
