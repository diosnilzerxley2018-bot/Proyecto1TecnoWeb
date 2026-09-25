import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { obtenerToken, registrarCliente, sufijo } from './ayudantes.js';

/**
 * Etapa 4: CU-INV-03 Gestionar Ingreso, CU-INV-04 Gestionar Egreso y
 * CU-INV-05 Control de Stock.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

/** El rol Empleado tiene INGRESO_REGISTRAR, EGRESO_REGISTRAR y STOCK_CONSULTAR. */
const tokenEmpleado = () => obtenerToken('repartidor', 'Reparto1234!');

async function idAlmacen(token: string, nombre: string) {
  const r = await request(app).get('/api/almacenes').set(cabecera(token));
  return r.body.find((a: { nombre: string }) => a.nombre === nombre).id as number;
}

async function buscarInsumo(token: string, termino: string) {
  const r = await request(app).get('/api/insumos').query({ termino }).set(cabecera(token));
  return r.body[0];
}

/** Crea un insumo sin existencias en ningún almacén. */
async function crearInsumoVacio(token: string, stockMinimo = 1, tipoConservacion = 'Seco') {
  const unidades = await request(app).get('/api/insumos/unidades').set(cabecera(token));
  const kg = unidades.body.find((u: { nombre: string }) => u.nombre === 'Kilogramo');

  const r = await request(app)
    .post('/api/insumos')
    .set(cabecera(token))
    .send({
      nombre: `Insumo ${sufijo()}`,
      idUnidad: kg.id,
      costoUnitario: 10,
      stockMinimo,
      tipoConservacion,
    })
    .expect(201);
  return r.body;
}

describe('CU-INV-03 Gestionar ingreso', () => {
  it('registra la nota, incrementa el stock y calcula el total', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const antes = await buscarInsumo(staff, 'Quinua');

    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Compra',
        proveedor: 'Distribuidora Andina',
        numeroDocumento: 'FAC-0012',
        insumos: [
          { idIngrediente: antes.id, idAlmacen: almacen, cantidad: 10, costoUnitario: 27.5 },
        ],
      });

    expect(r.status).toBe(201);
    expect(r.body.total).toBe(275);
    expect(r.body.proveedor).toBe('Distribuidora Andina');
    expect(r.body.registradoPor.nombreCompleto).toContain('Marcos');
    expect(r.body.lineas[0].unidad).toBe('kg');

    const despues = await buscarInsumo(staff, 'Quinua');
    expect(despues.stockTotal).toBe(antes.stockTotal + 10);
  });

  it('crea la fila de stock en el primer ingreso a un almacén nuevo', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Camara Refrigerada');
    const insumo = await crearInsumoVacio(staff, 1, 'Refrigerado');
    expect(insumo.existencias).toHaveLength(0);

    await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 7.5, costoUnitario: 4 }],
      })
      .expect(201);

    const despues = await buscarInsumo(staff, insumo.nombre);
    expect(despues.stockTotal).toBe(7.5);
    expect(despues.existencias[0].almacen).toBe('Camara Refrigerada');
  });

  it('admite insumos y productos en la misma nota', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await buscarInsumo(staff, 'Avena');

    const productos = await request(app)
      .get('/api/catalogo')
      .query({ termino: 'Barra de avena' });
    const producto = productos.body[0];

    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Ajuste',
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 2, costoUnitario: 15 }],
        productos: [{ idProducto: producto.id, idAlmacen: almacen, cantidad: 3, costoUnitario: 5 }],
      });

    expect(r.status).toBe(201);
    expect(r.body.lineas).toHaveLength(2);
    expect(r.body.total).toBe(45);
    expect(r.body.lineas.map((l: { tipo: string }) => l.tipo).sort()).toEqual([
      'insumo',
      'producto',
    ]);
  });

  it('agrupa líneas repetidas con promedio ponderado sin alterar el total', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await crearInsumoVacio(staff);

    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [
          { idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 10, costoUnitario: 10 },
          { idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 30, costoUnitario: 20 },
        ],
      });

    expect(r.status).toBe(201);
    expect(r.body.lineas).toHaveLength(1);
    expect(r.body.lineas[0].cantidad).toBe(40);
    expect(r.body.lineas[0].costoUnitario).toBe(17.5);
    expect(r.body.total).toBe(700);
  });

  it('rechaza una cantidad menor o igual a cero', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await buscarInsumo(staff, 'Avena');

    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 0, costoUnitario: 5 }],
      });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('mayor a cero');
  });

  it('rechaza una cantidad de producto no entera', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const productos = await request(app).get('/api/catalogo').query({ termino: 'Barra' });

    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        productos: [
          { idProducto: productos.body[0].id, idAlmacen: almacen, cantidad: 2.5, costoUnitario: 5 },
        ],
      });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('entero');
  });

  it('rechaza una nota sin líneas', async () => {
    const staff = await tokenEmpleado();
    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({ motivo: 'Compra', insumos: [], productos: [] });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('al menos un insumo o un producto');
  });

  it('rechaza un almacén inexistente', async () => {
    const staff = await tokenEmpleado();
    const insumo = await buscarInsumo(staff, 'Avena');

    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [{ idIngrediente: insumo.id, idAlmacen: 999999, cantidad: 1, costoUnitario: 1 }],
      });

    expect(r.status).toBe(404);
    expect(r.body.error).toContain('almacenes inexistentes');
  });

  it('rechaza el ingreso de un insumo dado de baja', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await crearInsumoVacio(staff);

    await request(app)
      .put(`/api/insumos/${insumo.id}`)
      .set(cabecera(staff))
      .send({ activo: false })
      .expect(200);

    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 1, costoUnitario: 1 }],
      });

    expect(r.status).toBe(404);
    expect(r.body.error).toContain('dados de baja');
  });

  it('rechaza guardar un insumo seco en una cámara refrigerada', async () => {
    const staff = await tokenEmpleado();
    const refrigerada = await idAlmacen(staff, 'Camara Refrigerada');
    const insumo = await crearInsumoVacio(staff, 1, 'Seco');

    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [{ idIngrediente: insumo.id, idAlmacen: refrigerada, cantidad: 1, costoUnitario: 1 }],
      });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Conservación incompatible');
    expect(r.body.error).toContain('requiere conservación Seco');
  });

  it('rechaza guardar un producto refrigerado en el almacén seco', async () => {
    const staff = await obtenerToken();
    const seco = await idAlmacen(staff, 'Almacen Seco');
    const productos = await request(app)
      .get('/api/productos')
      .query({ termino: 'Ensalada Cesar' })
      .set(cabecera(staff));
    const producto = productos.body[0];
    expect(producto.tipoConservacion).toBe('Refrigerado');

    const r = await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        productos: [{ idProducto: producto.id, idAlmacen: seco, cantidad: 1, costoUnitario: 1 }],
      });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Conservación incompatible');
  });

  it('lista las notas y filtra por motivo', async () => {
    const staff = await tokenEmpleado();
    const r = await request(app)
      .get('/api/ingresos')
      .query({ motivo: 'Compra' })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    for (const nota of r.body.datos) expect(nota.motivo).toBe('Compra');
  });

  it('un cliente no puede registrar ingresos', async () => {
    const cliente = await registrarCliente();
    const r = await request(app).get('/api/ingresos').set(cabecera(cliente.token));
    expect(r.status).toBe(403);
  });
});

describe('CU-INV-03 El costo del insumo sigue a lo que se paga', () => {
  /** Compra `cantidad` del insumo al precio indicado y devuelve su costo resultante. */
  async function comprar(
    token: string,
    insumo: { id: number },
    almacen: number,
    cantidad: number,
    costoUnitario: number,
    motivo = 'Compra',
  ) {
    await request(app)
      .post('/api/ingresos')
      .set(cabecera(token))
      .send({
        motivo,
        proveedor: 'Proveedor de prueba',
        numeroDocumento: `DOC-${sufijo()}`,
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad, costoUnitario }],
      })
      .expect(201);

    const r = await request(app).get(`/api/insumos/${insumo.id}`).set(cabecera(token));
    return r.body.costoUnitario as number;
  }

  it('la primera compra de un insumo sin existencias fija su costo', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    // Nace declarado en 10 y sin existencias: no hay nada contra qué promediar.
    const insumo = await crearInsumoVacio(staff);

    expect(await comprar(staff, insumo, almacen, 4, 5)).toBe(5);
  });

  it('promedia el costo viejo con el nuevo, pesados por cantidad', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await crearInsumoVacio(staff);

    // 4 unidades a 5 y después 5 a 10: (4x5 + 5x10) / 9 = 70/9 = 7.78
    await comprar(staff, insumo, almacen, 4, 5);
    expect(await comprar(staff, insumo, almacen, 5, 10)).toBe(7.78);
  });

  it('un ajuste de inventario no revaloriza lo que ya estaba', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await crearInsumoVacio(staff);
    await comprar(staff, insumo, almacen, 10, 8);

    // Un conteo que corrige cantidades no es una adquisición: mover el costo
    // con él permitiría torcerlo sin comprar nada.
    expect(await comprar(staff, insumo, almacen, 5, 99, 'Ajuste')).toBe(8);
  });

  it('el costo actualizado es el que valoriza la producción', async () => {
    // Insumo y receta propios: tocar el costo de un insumo del seed se filtraría
    // a las suites que calculan costos con él, según el orden en que corran.
    const staff = await obtenerToken();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await crearInsumoVacio(staff);
    await comprar(staff, insumo, almacen, 10, 10);
    await comprar(staff, insumo, almacen, 10, 30); // promedio: 20

    const categorias = await request(app).get('/api/catalogo/categorias');
    const producto = await request(app)
      .post('/api/productos')
      .set(cabecera(staff))
      .send({
        nombre: `Producto ${sufijo()}`,
        precioVenta: 50,
        idCategoria: categorias.body[0].id,
        tipoConservacion: 'Seco',
      })
      .expect(201);
    const receta = await request(app)
      .post(`/api/productos/${producto.body.id}/recetas`)
      .set(cabecera(staff))
      .send({
        nombre: `Receta ${sufijo()}`,
        rendimiento: 1,
        tiempoPreparacionMinutos: 5,
        activa: true,
        insumos: [{ idIngrediente: insumo.id, cantidadRequerida: 1 }],
      })
      .expect(201);

    const orden = await request(app)
      .post('/api/ordenes')
      .set(cabecera(staff))
      .send({ idReceta: receta.body.id, cantidad: 1 })
      .expect(201);

    // 1 kg al costo promedio de 20, no al de alta (10) ni al de la última compra (30).
    expect(orden.body.costoEstimado).toBe(20);
  });
});

describe('CU-INV-04 Gestionar egreso', () => {
  it('registra la nota y descuenta el stock', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const antes = await buscarInsumo(staff, 'Harina');

    const r = await request(app)
      .post('/api/egresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Merma',
        observacion: 'Bolsa rota en el deposito',
        insumos: [{ idIngrediente: antes.id, idAlmacen: almacen, cantidad: 2.5 }],
      });

    expect(r.status).toBe(201);
    expect(r.body.nota.motivo).toBe('Merma');
    expect(r.body.nota.lineas[0].cantidad).toBe(2.5);
    expect(r.body.nota.lineas[0].costoUnitario).toBeNull();

    const despues = await buscarInsumo(staff, 'Harina');
    expect(despues.stockTotal).toBe(antes.stockTotal - 2.5);
  });

  it('impide egresar más de lo disponible e informa la cantidad', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const antes = await buscarInsumo(staff, 'Almendras');
    const notasAntes = await request(app).get('/api/egresos').set(cabecera(staff));

    const r = await request(app)
      .post('/api/egresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Ajuste',
        insumos: [
          { idIngrediente: antes.id, idAlmacen: almacen, cantidad: antes.stockTotal + 1 },
        ],
      });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Stock insuficiente');
    expect(r.body.error).toContain(`disponible ${antes.stockTotal}`);

    // La transacción se revierte por completo: ni stock alterado ni nota creada.
    const despues = await buscarInsumo(staff, 'Almendras');
    expect(despues.stockTotal).toBe(antes.stockTotal);

    const notasDespues = await request(app).get('/api/egresos').set(cabecera(staff));
    // Se compara el total y no la página: la página solo trae las primeras.
    expect(notasDespues.body.total).toBe(notasAntes.body.total);
  });

  it('genera la alerta cuando el insumo alcanza su stock mínimo', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await crearInsumoVacio(staff, 5);

    await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 10, costoUnitario: 1 }],
      })
      .expect(201);

    const r = await request(app)
      .post('/api/egresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Produccion',
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 5 }],
      });

    expect(r.status).toBe(201);
    expect(r.body.alertas).toHaveLength(1);
    expect(r.body.alertas[0].id).toBe(insumo.id);
    expect(r.body.alertas[0].stockTotal).toBe(5);
    expect(r.body.alertas[0].stockMinimo).toBe(5);
  });

  it('no genera alerta si el insumo queda por encima de su mínimo', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await crearInsumoVacio(staff, 2);

    await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 20, costoUnitario: 1 }],
      })
      .expect(201);

    const r = await request(app)
      .post('/api/egresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Merma',
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 1 }],
      });

    expect(r.status).toBe(201);
    expect(r.body.alertas).toHaveLength(0);
  });

  it('permite egresar un insumo dado de baja, para poder vaciar el almacén', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await crearInsumoVacio(staff);

    await request(app)
      .post('/api/ingresos')
      .set(cabecera(staff))
      .send({
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 4, costoUnitario: 1 }],
      })
      .expect(201);

    await request(app)
      .put(`/api/insumos/${insumo.id}`)
      .set(cabecera(staff))
      .send({ activo: false })
      .expect(200);

    const r = await request(app)
      .post('/api/egresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Ajuste',
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 4 }],
      });

    expect(r.status).toBe(201);
  });

  it('rechaza un motivo que el esquema no admite', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Almacen Seco');
    const insumo = await buscarInsumo(staff, 'Avena');

    const r = await request(app)
      .post('/api/egresos')
      .set(cabecera(staff))
      .send({
        motivo: 'Venta',
        insumos: [{ idIngrediente: insumo.id, idAlmacen: almacen, cantidad: 1 }],
      });

    expect(r.status).toBe(400);
  });

  it('un cliente no puede registrar egresos', async () => {
    const cliente = await registrarCliente();
    const r = await request(app)
      .post('/api/egresos')
      .set(cabecera(cliente.token))
      .send({ motivo: 'Merma', insumos: [] });
    expect(r.status).toBe(403);
  });
});

describe('CU-INV-05 Control de stock', () => {
  it('consulta insumos y productos de forma consolidada', async () => {
    const staff = await tokenEmpleado();
    const r = await request(app).get('/api/stock').set(cabecera(staff));

    expect(r.status).toBe(200);
    const tipos = new Set(r.body.map((e: { tipo: string }) => e.tipo));
    expect(tipos).toContain('insumo');
    expect(tipos).toContain('producto');
  });

  it('filtra por tipo', async () => {
    const staff = await tokenEmpleado();
    const r = await request(app).get('/api/stock').query({ tipo: 'insumo' }).set(cabecera(staff));

    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
    for (const item of r.body) expect(item.tipo).toBe('insumo');
  });

  it('filtra por almacén', async () => {
    const staff = await tokenEmpleado();
    const almacen = await idAlmacen(staff, 'Camara Refrigerada');

    const r = await request(app)
      .get('/api/stock')
      .query({ almacen, tipo: 'insumo' })
      .set(cabecera(staff));

    expect(r.status).toBe(200);
    for (const item of r.body) {
      for (const existencia of item.existencias) {
        expect(existencia.idAlmacen).toBe(almacen);
      }
    }
  });

  it('presenta con stock cero al insumo sin existencias y lo incluye en alertas', async () => {
    const staff = await tokenEmpleado();
    const insumo = await crearInsumoVacio(staff, 3);

    const consulta = await request(app)
      .get('/api/stock')
      .query({ termino: insumo.nombre, tipo: 'insumo' })
      .set(cabecera(staff));

    expect(consulta.body).toHaveLength(1);
    expect(consulta.body[0].stockTotal).toBe(0);
    expect(consulta.body[0].bajoMinimo).toBe(true);
    expect(consulta.body[0].existencias).toHaveLength(0);

    const alertas = await request(app).get('/api/stock/alertas').set(cabecera(staff));
    const ids = alertas.body.map((a: { id: number }) => a.id);
    expect(ids).toContain(insumo.id);
  });

  it('los productos no generan alertas: el esquema no les define stock mínimo', async () => {
    const staff = await tokenEmpleado();
    const r = await request(app).get('/api/stock').query({ tipo: 'producto' }).set(cabecera(staff));

    for (const item of r.body) {
      expect(item.stockMinimo).toBeNull();
      expect(item.bajoMinimo).toBe(false);
    }
  });

  it('un cliente no puede consultar el stock', async () => {
    const cliente = await registrarCliente();
    const r = await request(app).get('/api/stock').set(cabecera(cliente.token));
    expect(r.status).toBe(403);
  });
});
