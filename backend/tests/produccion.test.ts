import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { obtenerToken, registrarCliente, crearPedido, sufijo } from './ayudantes.js';

/** Firma real de un PNG, seguida de relleno para simular un archivo de cierto tamaño. */
function bufferPNG(relleno = 200): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(relleno, 1),
  ]);
}

/**
 * Etapa 3: CU-PRO-01 Gestionar Producto y Receta, con CU-PRO-03 Registrar
 * Valor Nutricional como extensión opcional.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

async function idCategoria(nombre = 'Ensaladas') {
  const r = await request(app).get('/api/catalogo/categorias');
  return r.body.find((c: { nombre: string }) => c.nombre === nombre).id as number;
}

async function idInsumo(token: string, termino: string) {
  const r = await request(app).get('/api/insumos').query({ termino }).set(cabecera(token));
  return r.body[0].id as number;
}

async function crearProducto(token: string, extra: Record<string, unknown> = {}) {
  const r = await request(app)
    .post('/api/productos')
    .set(cabecera(token))
    .send({
      nombre: `Producto ${sufijo()}`,
      descripcion: 'Producto creado en pruebas',
      precioVenta: 25,
      idCategoria: await idCategoria(),
      ...extra,
    });
  if (r.status !== 201) throw new Error(`No se pudo crear el producto: ${JSON.stringify(r.body)}`);
  return r.body;
}

async function buscarProductoGestion(token: string, nombre: string) {
  const r = await request(app).get('/api/productos').query({ termino: nombre }).set(cabecera(token));
  return r.body[0];
}

describe('CU-PRO-01 Gestionar producto', () => {
  it('lista los productos con su categoría y existencias', async () => {
    const staff = await obtenerToken();
    const r = await request(app).get('/api/productos').set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThanOrEqual(10);

    const jugo = r.body.find((p: { nombre: string }) => p.nombre === 'Jugo verde detox');
    expect(jugo.categoria.nombre).toBe('Bebidas naturales');
    expect(jugo.stockTotal).toBeGreaterThan(0);
  });

  it('registra un producto nuevo', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff, { precioVenta: 33.5 });

    expect(producto.precio).toBe(33.5);
    expect(producto.activo).toBe(true);
    expect(producto.valorNutricional).toBeNull();
  });

  it('rechaza un precio de venta negativo', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .post('/api/productos')
      .set(cabecera(staff))
      .send({ nombre: `Producto ${sufijo()}`, precioVenta: -5, idCategoria: await idCategoria() });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('no puede ser negativo');
  });

  it('rechaza una categoría inexistente', async () => {
    const staff = await obtenerToken();
    const r = await request(app)
      .post('/api/productos')
      .set(cabecera(staff))
      .send({ nombre: `Producto ${sufijo()}`, precioVenta: 10, idCategoria: 999999 });

    expect(r.status).toBe(404);
    expect(r.body.error).toContain('categoría');
  });

  it('la baja lógica lo retira del catálogo público', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);

    const visible = await request(app).get('/api/catalogo').query({ termino: producto.nombre });
    expect(visible.body).toHaveLength(1);

    await request(app)
      .put(`/api/productos/${producto.id}`)
      .set(cabecera(staff))
      .send({ activo: false })
      .expect(200);

    const oculto = await request(app).get('/api/catalogo').query({ termino: producto.nombre });
    expect(oculto.body).toHaveLength(0);

    const paraElPersonal = await request(app)
      .get('/api/productos')
      .query({ termino: producto.nombre, incluirInactivos: 'true' })
      .set(cabecera(staff));
    expect(paraElPersonal.body).toHaveLength(1);
  });

  it('elimina un producto sin operaciones, existencias ni recetas', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);

    await request(app).delete(`/api/productos/${producto.id}`).set(cabecera(staff)).expect(204);
    await request(app).get(`/api/productos/${producto.id}`).set(cabecera(staff)).expect(404);
  });

  it('no elimina un producto con pedidos y ofrece la baja lógica', async () => {
    const staff = await obtenerToken();
    const cliente = await registrarCliente();
    await crearPedido(cliente.token, 'Jugo verde');

    const jugo = await buscarProductoGestion(staff, 'Jugo verde');
    const r = await request(app).delete(`/api/productos/${jugo.id}`).set(cabecera(staff));

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('pedido(s) registrados');
    expect(r.body.error).toContain('darlo de baja');
  });

  it('no elimina un producto que tiene receta', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);
    const avena = await idInsumo(staff, 'Avena');

    await request(app)
      .post(`/api/productos/${producto.id}/recetas`)
      .set(cabecera(staff))
      .send({
        nombre: 'Receta que bloquea el borrado',
        rendimiento: 1,
        tiempoPreparacionMinutos: 5,
        insumos: [{ idIngrediente: avena, cantidadRequerida: 0.1 }],
      })
      .expect(201);

    const r = await request(app).delete(`/api/productos/${producto.id}`).set(cabecera(staff));

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('recetas');
  });

  it('un cliente no puede gestionar productos', async () => {
    const cliente = await registrarCliente();
    const r = await request(app).get('/api/productos').set(cabecera(cliente.token));
    expect(r.status).toBe(403);
  });
});

describe('CU-PRO-03 Registrar valor nutricional', () => {
  it('se registra después del alta, porque es opcional', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);
    expect(producto.valorNutricional).toBeNull();

    const r = await request(app)
      .put(`/api/productos/${producto.id}/valor-nutricional`)
      .set(cabecera(staff))
      .send({ calorias: 300, proteinas: 12.5, carbohidratos: 40, grasas: 8, fibra: 4.2 });

    expect(r.status).toBe(200);
    expect(r.body.valorNutricional.calorias).toBe(300);
    expect(r.body.valorNutricional.proteinas).toBe(12.5);
    expect(r.body.valorNutricional.fibra).toBe(4.2);
  });

  it('reemplaza la información ya registrada', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);
    const cuerpo = { calorias: 100, proteinas: 1, carbohidratos: 2, grasas: 3 };

    await request(app)
      .put(`/api/productos/${producto.id}/valor-nutricional`)
      .set(cabecera(staff))
      .send(cuerpo)
      .expect(200);

    const r = await request(app)
      .put(`/api/productos/${producto.id}/valor-nutricional`)
      .set(cabecera(staff))
      .send({ ...cuerpo, calorias: 250 });

    expect(r.body.valorNutricional.calorias).toBe(250);
    expect(r.body.valorNutricional.fibra).toBeNull();
  });

  it('rechaza valores negativos', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);

    const r = await request(app)
      .put(`/api/productos/${producto.id}/valor-nutricional`)
      .set(cabecera(staff))
      .send({ calorias: -1, proteinas: 1, carbohidratos: 2, grasas: 3 });

    expect(r.status).toBe(400);
  });

  it('queda visible en el catálogo público', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);

    await request(app)
      .put(`/api/productos/${producto.id}/valor-nutricional`)
      .set(cabecera(staff))
      .send({ calorias: 180, proteinas: 5, carbohidratos: 20, grasas: 7 })
      .expect(200);

    const r = await request(app).get(`/api/catalogo/${producto.id}`);
    expect(r.body.valorNutricional.calorias).toBe(180);
  });
});

describe('RF-PRO Foto del producto', () => {
  it('sube una imagen y queda disponible en el catálogo público', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);
    const png = bufferPNG();

    const subida = await request(app)
      .post(`/api/productos/${producto.id}/imagen`)
      .set(cabecera(staff))
      .attach('imagen', png, 'foto.png');
    expect(subida.status).toBe(200);
    expect(subida.body.imagenActualizadaEn).not.toBeNull();

    const detalle = await request(app).get(`/api/catalogo/${producto.id}`);
    expect(detalle.body.imagenActualizadaEn).not.toBeNull();

    const imagen = await request(app).get(`/api/catalogo/${producto.id}/imagen`);
    expect(imagen.status).toBe(200);
    expect(imagen.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(imagen.body as Buffer, png)).toBe(0);
  });

  it('decide el tipo por los bytes reales, no por lo que declara el cliente', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);
    // Texto plano disfrazado de imagen: el nombre y el Content-Type mienten,
    // la firma de los primeros bytes no.
    const noEsImagen = Buffer.from('esto no es una imagen'.repeat(10));

    const r = await request(app)
      .post(`/api/productos/${producto.id}/imagen`)
      .set(cabecera(staff))
      .attach('imagen', noEsImagen, { filename: 'foto.png', contentType: 'image/png' });

    expect(r.status).toBe(415);
  });

  it('rechaza un archivo que excede el tamaño máximo', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);
    const demasiadoGrande = bufferPNG(3 * 1024 * 1024 + 1);

    const r = await request(app)
      .post(`/api/productos/${producto.id}/imagen`)
      .set(cabecera(staff))
      .attach('imagen', demasiadoGrande, 'foto.png');

    expect(r.status).toBe(413);
  });

  it('exige el permiso de gestión, no solo una sesión iniciada', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);
    const cliente = await registrarCliente();

    const r = await request(app)
      .post(`/api/productos/${producto.id}/imagen`)
      .set(cabecera(cliente.token))
      .attach('imagen', bufferPNG(), 'foto.png');

    expect(r.status).toBe(403);
  });

  it('se puede quitar, y el catálogo vuelve a no tener foto', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);
    await request(app)
      .post(`/api/productos/${producto.id}/imagen`)
      .set(cabecera(staff))
      .attach('imagen', bufferPNG(), 'foto.png')
      .expect(200);

    const eliminacion = await request(app)
      .delete(`/api/productos/${producto.id}/imagen`)
      .set(cabecera(staff));
    expect(eliminacion.status).toBe(200);
    expect(eliminacion.body.imagenActualizadaEn).toBeNull();

    const imagen = await request(app).get(`/api/catalogo/${producto.id}/imagen`);
    expect(imagen.status).toBe(404);
  });
});

describe('RF-PRO-04 Versiones de receta', () => {
  it('lista la versión activa cargada para un producto', async () => {
    const staff = await obtenerToken();
    const barra = await buscarProductoGestion(staff, 'Barra de avena');

    const r = await request(app).get(`/api/productos/${barra.id}/recetas`).set(cabecera(staff));

    expect(r.status).toBe(200);

    // Cualquiera sea la cantidad de versiones, solo una puede estar activa.
    const activas = r.body.filter((receta: { activa: boolean }) => receta.activa);
    expect(activas).toHaveLength(1);

    const base = r.body.find(
      (receta: { nombre: string }) => receta.nombre === 'Barra de avena - version base',
    );
    expect(base.rendimiento).toBe(4);
    expect(base.insumos).toHaveLength(3);
    expect(base.insumos[0]).toHaveProperty('unidad');
  });

  it('registra una versión nueva inactiva', async () => {
    const staff = await obtenerToken();
    const barra = await buscarProductoGestion(staff, 'Barra de avena');
    const avena = await idInsumo(staff, 'Avena');

    const r = await request(app)
      .post(`/api/productos/${barra.id}/recetas`)
      .set(cabecera(staff))
      .send({
        nombre: `Barra v2 ${sufijo()}`,
        rendimiento: 6,
        tiempoPreparacionMinutos: 40,
        instrucciones: 'Version con mas rendimiento.',
        insumos: [{ idIngrediente: avena, cantidadRequerida: 0.3 }],
      });

    expect(r.status).toBe(201);
    expect(r.body.activa).toBe(false);
    expect(r.body.producto.nombre).toBe('Barra de avena y almendras');
  });

  it('rechaza registrar una segunda receta activa para el mismo producto', async () => {
    const staff = await obtenerToken();
    const barra = await buscarProductoGestion(staff, 'Barra de avena');
    const avena = await idInsumo(staff, 'Avena');

    const r = await request(app)
      .post(`/api/productos/${barra.id}/recetas`)
      .set(cabecera(staff))
      .send({
        nombre: `Barra activa ${sufijo()}`,
        rendimiento: 3,
        tiempoPreparacionMinutos: 30,
        activa: true,
        insumos: [{ idIngrediente: avena, cantidadRequerida: 0.2 }],
      });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('ya tiene la receta activa');
  });

  it('al activar una versión, desactiva automáticamente la anterior', async () => {
    const staff = await obtenerToken();
    const mousse = await buscarProductoGestion(staff, 'Mousse');
    const yogur = await idInsumo(staff, 'Yogur');

    const anteriores = await request(app)
      .get(`/api/productos/${mousse.id}/recetas`)
      .set(cabecera(staff));
    const vigente = anteriores.body.find((r: { activa: boolean }) => r.activa);

    const nueva = await request(app)
      .post(`/api/productos/${mousse.id}/recetas`)
      .set(cabecera(staff))
      .send({
        nombre: `Mousse v2 ${sufijo()}`,
        rendimiento: 3,
        tiempoPreparacionMinutos: 20,
        insumos: [{ idIngrediente: yogur, cantidadRequerida: 0.4 }],
      })
      .expect(201);

    const activada = await request(app)
      .post(`/api/recetas/${nueva.body.id}/activar`)
      .set(cabecera(staff));

    expect(activada.status).toBe(200);
    expect(activada.body.activa).toBe(true);

    const despues = await request(app)
      .get(`/api/productos/${mousse.id}/recetas`)
      .set(cabecera(staff));

    const activas = despues.body.filter((r: { activa: boolean }) => r.activa);
    expect(activas).toHaveLength(1);
    expect(activas[0].id).toBe(nueva.body.id);
    expect(despues.body.find((r: { id: number }) => r.id === vigente.id).activa).toBe(false);
  });

  it('rechaza un rendimiento igual a cero', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);
    const avena = await idInsumo(staff, 'Avena');

    const r = await request(app)
      .post(`/api/productos/${producto.id}/recetas`)
      .set(cabecera(staff))
      .send({
        nombre: 'Sin rendimiento',
        rendimiento: 0,
        tiempoPreparacionMinutos: 10,
        insumos: [{ idIngrediente: avena, cantidadRequerida: 1 }],
      });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('mayor a cero');
  });

  it('rechaza una receta sin insumos', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);

    const r = await request(app)
      .post(`/api/productos/${producto.id}/recetas`)
      .set(cabecera(staff))
      .send({ nombre: 'Vacia', rendimiento: 1, tiempoPreparacionMinutos: 5, insumos: [] });

    expect(r.status).toBe(400);
  });

  it('rechaza un insumo inexistente', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);

    const r = await request(app)
      .post(`/api/productos/${producto.id}/recetas`)
      .set(cabecera(staff))
      .send({
        nombre: 'Con insumo fantasma',
        rendimiento: 1,
        tiempoPreparacionMinutos: 5,
        insumos: [{ idIngrediente: 999999, cantidadRequerida: 1 }],
      });

    expect(r.status).toBe(404);
    expect(r.body.error).toContain('insumos inexistentes');
  });

  it('agrupa las líneas repetidas del mismo insumo', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);
    const avena = await idInsumo(staff, 'Avena');

    const r = await request(app)
      .post(`/api/productos/${producto.id}/recetas`)
      .set(cabecera(staff))
      .send({
        nombre: 'Con repetidos',
        rendimiento: 1,
        tiempoPreparacionMinutos: 5,
        insumos: [
          { idIngrediente: avena, cantidadRequerida: 0.2 },
          { idIngrediente: avena, cantidadRequerida: 0.3 },
        ],
      });

    expect(r.status).toBe(201);
    expect(r.body.insumos).toHaveLength(1);
    expect(r.body.insumos[0].cantidadRequerida).toBe(0.5);
  });

  it('actualiza la receta reemplazando su detalle', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);
    const avena = await idInsumo(staff, 'Avena');
    const almendras = await idInsumo(staff, 'Almendras');

    const creada = await request(app)
      .post(`/api/productos/${producto.id}/recetas`)
      .set(cabecera(staff))
      .send({
        nombre: 'Version inicial',
        rendimiento: 1,
        tiempoPreparacionMinutos: 5,
        insumos: [{ idIngrediente: avena, cantidadRequerida: 0.2 }],
      })
      .expect(201);

    const r = await request(app)
      .put(`/api/recetas/${creada.body.id}`)
      .set(cabecera(staff))
      .send({
        rendimiento: 8,
        insumos: [{ idIngrediente: almendras, cantidadRequerida: 0.1 }],
      });

    expect(r.status).toBe(200);
    expect(r.body.rendimiento).toBe(8);
    expect(r.body.insumos).toHaveLength(1);
    expect(r.body.insumos[0].nombre).toBe('Almendras');
  });

  it('elimina una versión que no tiene órdenes de producción', async () => {
    const staff = await obtenerToken();
    const producto = await crearProducto(staff);
    const avena = await idInsumo(staff, 'Avena');

    const creada = await request(app)
      .post(`/api/productos/${producto.id}/recetas`)
      .set(cabecera(staff))
      .send({
        nombre: 'Descartable',
        rendimiento: 1,
        tiempoPreparacionMinutos: 5,
        insumos: [{ idIngrediente: avena, cantidadRequerida: 0.1 }],
      })
      .expect(201);

    await request(app).delete(`/api/recetas/${creada.body.id}`).set(cabecera(staff)).expect(204);
    await request(app).get(`/api/recetas/${creada.body.id}`).set(cabecera(staff)).expect(404);
  });

  it('las instrucciones nunca salen al catálogo público', async () => {
    const publico = await request(app).get('/api/catalogo');
    const detalle = await request(app).get('/api/catalogo/1');

    expect(JSON.stringify(publico.body)).not.toContain('instrucciones');
    expect(JSON.stringify(detalle.body)).not.toContain('instrucciones');
  });
});
