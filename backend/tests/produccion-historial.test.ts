import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { obtenerToken, sufijo } from './ayudantes.js';

/**
 * Hallazgos H5, H6 y H10 — lo que la corrida dejó registrado.
 *
 * Los tres son la misma carencia vista por tres lados: la orden no guardaba lo
 * que **ocurrió**, solo lo que se había **planificado**. El costo se
 * recalculaba, los insumos se leían de la receta viva y la cantidad obtenida
 * era siempre la prevista.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

async function recetaDe(token: string, nombreProducto: string) {
  const productos = await request(app)
    .get('/api/productos')
    .query({ termino: nombreProducto })
    .set(cabecera(token));
  const recetas = await request(app)
    .get(`/api/productos/${productos.body[0].id}/recetas`)
    .set(cabecera(token));

  const activa = recetas.body.find((r: { activa: boolean }) => r.activa);
  return { idProducto: productos.body[0].id as number, idReceta: activa.id as number };
}

/** Crea una orden y la deja En proceso, lista para finalizar. */
async function ordenEnProceso(token: string, idReceta: number, cantidad: number) {
  const orden = await request(app)
    .post('/api/ordenes')
    .set(cabecera(token))
    .send({ idReceta, cantidad });
  if (orden.status !== 201) throw new Error(JSON.stringify(orden.body));

  await request(app)
    .post(`/api/ordenes/${orden.body.id}/iniciar`)
    .set(cabecera(token))
    .expect(200);

  return orden.body.id as number;
}

const finalizar = (token: string, idOrden: number, cuerpo: object = {}) =>
  request(app).post(`/api/ordenes/${idOrden}/finalizar`).set(cabecera(token)).send(cuerpo);

async function stockDeProducto(token: string, termino: string) {
  const r = await request(app).get('/api/productos').query({ termino }).set(cabecera(token));
  return r.body[0].stockTotal as number;
}

describe('H10 · La producción admite mermas', () => {
  /** El caso corriente no debe estorbar: sin decir nada, sale lo planificado. */
  it('sin indicar nada, se obtiene lo planificado', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await recetaDe(staff, 'Barra de avena');
    const id = await ordenEnProceso(staff, idReceta, 4);

    const r = await finalizar(staff, id);

    expect(r.status).toBe(200);
    expect(r.body.cantidadObtenida).toBe(4);
    expect(r.body.merma).toBe(0);
  });

  /**
   * El caso que motivó el hallazgo: se hornean veinte y tres salen quemadas.
   * Antes el sistema creía que había veinte.
   */
  it('lo que entra al almacén es lo obtenido, no lo planificado', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await recetaDe(staff, 'Barra de avena');
    const antes = await stockDeProducto(staff, 'Barra de avena');

    const id = await ordenEnProceso(staff, idReceta, 8);
    const r = await finalizar(staff, id, { cantidadObtenida: 5 });

    expect(r.status).toBe(200);
    expect(r.body.cantidadObtenida).toBe(5);
    expect(r.body.merma).toBe(3);

    const despues = await stockDeProducto(staff, 'Barra de avena');
    expect(despues).toBe(antes + 5);
  });

  /**
   * El costo se reparte entre lo obtenido, no entre lo planificado: si se
   * perdieron unidades, las que quedaron cargan con su costo. Es lo que
   * convierte el dato en información de costos y no en un adorno.
   */
  it('la merma encarece cada unidad que sí salió', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await recetaDe(staff, 'Barra de avena');

    const completa = await ordenEnProceso(staff, idReceta, 4);
    const sinMerma = await finalizar(staff, completa);

    const conPerdida = await ordenEnProceso(staff, idReceta, 4);
    const conMerma = await finalizar(staff, conPerdida, { cantidadObtenida: 2 });

    expect(sinMerma.body.costoEstimado).toBeCloseTo(conMerma.body.costoEstimado, 2);
    expect(conMerma.body.costoUnitario).toBeGreaterThan(sinMerma.body.costoUnitario);
  });

  /** Salir de más no es una merma negativa: es un rendimiento mejor. */
  it('obtener de más no se llama merma', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await recetaDe(staff, 'Barra de avena');
    const antes = await stockDeProducto(staff, 'Barra de avena');

    const id = await ordenEnProceso(staff, idReceta, 4);
    const r = await finalizar(staff, id, { cantidadObtenida: 6 });

    expect(r.body.cantidadObtenida).toBe(6);
    expect(r.body.merma).toBe(0);
    expect(await stockDeProducto(staff, 'Barra de avena')).toBe(antes + 6);
  });

  /**
   * Pérdida total: los insumos se consumieron igual. No emitir nota de ingreso
   * es lo que hace visible la pérdida en lugar de esconderla.
   */
  it('un lote perdido por completo no ingresa nada, pero sí consume', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await recetaDe(staff, 'Barra de avena');
    const antes = await stockDeProducto(staff, 'Barra de avena');

    const id = await ordenEnProceso(staff, idReceta, 4);
    const r = await finalizar(staff, id, { cantidadObtenida: 0 });

    expect(r.status).toBe(200);
    expect(r.body.cantidadObtenida).toBe(0);
    expect(r.body.merma).toBe(4);
    expect(r.body.costoUnitario).toBeNull();
    expect(r.body.notas.ingreso).toBeNull();
    // El egreso sí existe: los insumos salieron.
    expect(r.body.notas.egreso).toBeGreaterThan(0);
    expect(await stockDeProducto(staff, 'Barra de avena')).toBe(antes);
  });

  it('rechaza una cantidad obtenida negativa', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await recetaDe(staff, 'Barra de avena');
    const id = await ordenEnProceso(staff, idReceta, 4);

    const r = await finalizar(staff, id, { cantidadObtenida: -1 });
    expect(r.status).toBe(400);
  });

  it('una orden sin finalizar no declara cantidad obtenida ni merma', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await recetaDe(staff, 'Barra de avena');
    const id = await ordenEnProceso(staff, idReceta, 4);

    const r = await request(app).get(`/api/ordenes/${id}`).set(cabecera(staff));

    expect(r.body.cantidadObtenida).toBeNull();
    expect(r.body.merma).toBeNull();
    expect(r.body.costoUnitario).toBeNull();
  });
});

describe('H6 · Una orden finalizada conserva lo que consumió', () => {
  /**
   * El caso que motivó el hallazgo: alguien corrige la receta de las galletas
   * y las órdenes del mes pasado pasan a declarar que consumieron lo nuevo. El
   * historial se reescribía solo, en silencio.
   */
  it('editar la receta no reescribe las órdenes ya finalizadas', async () => {
    const staff = await obtenerToken();
    const { idProducto, idReceta } = await recetaDe(staff, 'Barra de avena');

    const id = await ordenEnProceso(staff, idReceta, 4);
    const finalizada = await finalizar(staff, id);
    expect(finalizada.status).toBe(200);

    const antesDeEditar = finalizada.body.insumosRequeridos.map(
      (i: { nombre: string; cantidadRequerida: number }) => [i.nombre, i.cantidadRequerida],
    );
    expect(antesDeEditar.length).toBeGreaterThan(0);

    const receta = await request(app).get(`/api/recetas/${idReceta}`).set(cabecera(staff));
    const original = receta.body.insumos as {
      idIngrediente: number;
      cantidadRequerida: number;
    }[];

    /** Reescribe la receta con las cantidades que se le pasen. */
    const reescribir = (
      insumos: { idIngrediente: number; cantidadRequerida: number }[],
    ) =>
      request(app)
        .put(`/api/recetas/${idReceta}`)
        .set(cabecera(staff))
        .send({
          nombre: receta.body.nombre,
          rendimiento: receta.body.rendimiento,
          idProducto,
          insumos,
        });

    try {
      // Se duplica la cantidad de cada insumo de la receta.
      const editada = await reescribir(
        original.map((i) => ({
          idIngrediente: i.idIngrediente,
          cantidadRequerida: i.cantidadRequerida * 2,
        })),
      );
      expect(editada.status).toBe(200);

      const despues = await request(app).get(`/api/ordenes/${id}`).set(cabecera(staff));
      const despuesDeEditar = despues.body.insumosRequeridos.map(
        (i: { nombre: string; cantidadRequerida: number }) => [i.nombre, i.cantidadRequerida],
      );

      expect(despuesDeEditar).toEqual(antesDeEditar);
    } finally {
      /*
       * La receta vuelve a como estaba, pase lo que pase.
       *
       * Toda la suite comparte una sola base y corre en serie: una receta que
       * queda con el doble de insumos hace fallar a las pruebas de producción
       * que corran después, y el fallo aparece lejos de su causa.
       */
      await reescribir(original);
    }
  });

  /** Para una orden que aún no se ejecutó, la receta vigente sí es la respuesta. */
  it('una orden pendiente sigue mostrando la previsión de la receta', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await recetaDe(staff, 'Bowl de quinua');

    const orden = await request(app)
      .post('/api/ordenes')
      .set(cabecera(staff))
      .send({ idReceta, cantidad: 2 });
    expect(orden.status).toBe(201);
    expect(orden.body.insumosRequeridos.length).toBeGreaterThan(0);
    expect(orden.body.costoEstimado).toBeGreaterThan(0);
  });

  it('los insumos de una orden finalizada son los que registró su egreso', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await recetaDe(staff, 'Barra de avena');
    const id = await ordenEnProceso(staff, idReceta, 4);
    const orden = await finalizar(staff, id);

    const egreso = await request(app)
      .get(`/api/egresos/${orden.body.notas.egreso}`)
      .set(cabecera(staff));

    const delEgreso = egreso.body.lineas
      .map((l: { nombre: string; cantidad: number }) => `${l.nombre}:${l.cantidad}`)
      .sort();
    const deLaOrden = orden.body.insumosRequeridos
      .map((i: { nombre: string; cantidadRequerida: number }) => `${i.nombre}:${i.cantidadRequerida}`)
      .sort();

    expect(deLaOrden).toEqual(delEgreso);
  });
});

describe('H5 · El costo de la corrida queda registrado', () => {
  /**
   * Antes se recalculaba en cada consulta con los costos de hoy: corregir el
   * precio de un insumo reescribía el costo de todo lo ya producido.
   */
  it('cambiar el costo de un insumo no altera el costo de lo ya producido', async () => {
    const staff = await obtenerToken();
    const s = sufijo();
    const cab = cabecera(staff);

    // Insumo, producto y receta propios: el costo de un insumo solo lo mueve
    // una compra, y comprar avena del seed le cambiaba el costo a las demás
    // pruebas que la usan.
    const kg = (await request(app).get('/api/insumos/unidades').set(cab)).body.find(
      (u: { nombre: string }) => u.nombre === 'Kilogramo',
    ).id;
    const seco = (await request(app).get('/api/almacenes').set(cab)).body.find(
      (a: { nombre: string }) => a.nombre === 'Almacen Seco',
    ).id;
    const categoria = (await request(app).get('/api/catalogo/categorias')).body[0].id;
    const cacao = (
      await request(app)
        .post('/api/insumos')
        .set(cab)
        .send({ nombre: `Cacao ${s}`, idUnidad: kg, stockMinimo: 0 })
        .expect(201)
    ).body.id;
    const comprar = (cantidad: number, costoUnitario: number) =>
      request(app)
        .post('/api/ingresos')
        .set(cab)
        .send({
          motivo: 'Compra',
          insumos: [{ idIngrediente: cacao, idAlmacen: seco, cantidad, costoUnitario }],
        })
        .expect(201);
    await comprar(10, 20);
    const bombon = (
      await request(app)
        .post('/api/productos')
        .set(cab)
        .send({ nombre: `Bombon ${s}`, precioVenta: 30, idCategoria: categoria })
        .expect(201)
    ).body.id;
    const idReceta = (
      await request(app)
        .post(`/api/productos/${bombon}/recetas`)
        .set(cab)
        .send({
          nombre: 'Bombón',
          rendimiento: 1,
          tiempoPreparacionMinutos: 5,
          activa: true,
          insumos: [{ idIngrediente: cacao, cantidadRequerida: 0.5 }],
        })
        .expect(201)
    ).body.id;

    const id = await ordenEnProceso(staff, idReceta, 4);
    const finalizada = await finalizar(staff, id, { idAlmacenDestino: seco });
    // 4 × 0,5 kg × Bs 20.
    expect(finalizada.body.costoEstimado).toBe(40);

    // Una compra cara sube el costo del cacao: (8 kg × 20 + 1 kg × 200) / 9 = Bs 40.
    await comprar(1, 200);
    const cacaoHoy = await request(app).get(`/api/insumos/${cacao}`).set(cab);
    expect(cacaoHoy.body.costoUnitario).toBe(40);

    const despues = await request(app).get(`/api/ordenes/${id}`).set(cab);
    expect(despues.body.costoEstimado).toBe(40);
  });

  it('el reporte de producción usa el costo registrado y cuenta la merma', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await recetaDe(staff, 'Barra de avena');

    const id = await ordenEnProceso(staff, idReceta, 6);
    await finalizar(staff, id, { cantidadObtenida: 4 });

    const d = new Date();
    const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const r = await request(app)
      .get('/api/reportes/produccion')
      .query({ desde: hoy, hasta: hoy })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.resumen.merma).toBeGreaterThanOrEqual(2);

    const corrida = r.body.corridas.find((c: { idOrden: number }) => c.idOrden === id);
    expect(corrida.cantidad).toBe(4);
    expect(corrida.merma).toBe(2);
  });
});

describe('H4 · El almacén de destino queda registrado', () => {
  it('la orden finalizada dice a qué almacén fue el producto', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await recetaDe(staff, 'Barra de avena');
    const id = await ordenEnProceso(staff, idReceta, 4);

    const r = await finalizar(staff, id);

    expect(r.body.almacenDestino).not.toBeNull();
    expect(r.body.almacenDestino.nombre).toBeTruthy();
    expect(r.body.almacenDestino.id).toBeGreaterThan(0);
  });

  it('sin producto ingresado no hay almacén de destino', async () => {
    const staff = await obtenerToken();
    const { idReceta } = await recetaDe(staff, 'Barra de avena');
    const id = await ordenEnProceso(staff, idReceta, 4);

    const r = await finalizar(staff, id, { cantidadObtenida: 0 });
    expect(r.body.almacenDestino).toBeNull();
  });
});
