import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { crearEmpleado, obtenerToken } from './ayudantes.js';

/**
 * Leer no es gestionar (RNF-SEG-04 sigue igual: el permiso se consulta en
 * cada petición).
 *
 * El administrador puede recortarle permisos a cada empleado (CU-SEG-04). A la
 * almacenera sin PRODUCTO_GESTIONAR no le cargaba el formulario de notas, que
 * lista los productos, y al cocinero sin él no le cargaba el de órdenes, que
 * lista productos, recetas, insumos y almacenes.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Un empleado con exactamente estos permisos de su rol. */
async function empleadoCon(permisos: string[]): Promise<string> {
  const admin = await obtenerToken();
  const empleado = await crearEmpleado('Almacenero');

  const disponibles = await request(app)
    .get(`/api/usuarios/${empleado.id}/permisos`)
    .set(cabecera(admin))
    .expect(200);
  const ids = (disponibles.body as { idRolPermiso: number; permiso: string }[])
    .filter((p) => permisos.includes(p.permiso))
    .map((p) => p.idRolPermiso);
  expect(ids).toHaveLength(permisos.length);

  await request(app)
    .put(`/api/usuarios/${empleado.id}/permisos`)
    .set(cabecera(admin))
    .send({ idsRolPermiso: ids })
    .expect(200);
  return empleado.token;
}

async function unProducto(): Promise<number> {
  const r = await request(app).get('/api/productos').set(cabecera(await obtenerToken()));
  return r.body[0].id as number;
}

describe('Permisos · leer productos sin administrarlos', () => {
  it('quien mueve inventario ve la lista y la ficha, pero no crea ni lee recetas', async () => {
    const almacen = await empleadoCon(['STOCK_CONSULTAR', 'INGRESO_REGISTRAR', 'EGRESO_REGISTRAR']);
    const id = await unProducto();

    await request(app).get('/api/productos').set(cabecera(almacen)).expect(200);
    const ficha = await request(app).get(`/api/productos/${id}`).set(cabecera(almacen));
    expect(ficha.status).toBe(200);
    expect(ficha.body).toHaveProperty('costoPromedio');

    await request(app)
      .post('/api/productos')
      .set(cabecera(almacen))
      .send({ nombre: 'No debe crearse', precioVenta: 10, idCategoria: 1, tipoConservacion: 'Seco' })
      .expect(403);
    await request(app).get(`/api/productos/${id}/recetas`).set(cabecera(almacen)).expect(403);
  });

  it('quien produce lee productos, recetas, insumos y almacenes, pero no cambia un precio', async () => {
    const cocina = await empleadoCon(['ORDEN_PRODUCCION_GESTIONAR']);
    const id = await unProducto();

    await request(app).get('/api/productos').set(cabecera(cocina)).expect(200);
    await request(app).get(`/api/productos/${id}/recetas`).set(cabecera(cocina)).expect(200);
    await request(app).get('/api/insumos').set(cabecera(cocina)).expect(200);
    await request(app).get('/api/almacenes').set(cabecera(cocina)).expect(200);

    await request(app)
      .put(`/api/productos/${id}`)
      .set(cabecera(cocina))
      .send({ precioVenta: 1 })
      .expect(403);
    // Leer la lista de insumos no abre el resto del inventario.
    await request(app).get('/api/stock').set(cabecera(cocina)).expect(403);
  });

  it('sin ninguno de esos permisos, la lista sigue cerrada y dice cuáles sirven', async () => {
    const ventas = await empleadoCon(['VENTA_REGISTRAR']);

    const r = await request(app).get('/api/productos').set(cabecera(ventas));

    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/PRODUCTO_GESTIONAR/);
    expect(r.body.error).toMatch(/STOCK_CONSULTAR/);
  });
});
