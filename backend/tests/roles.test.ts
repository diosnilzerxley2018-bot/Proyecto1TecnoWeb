import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { crearEmpleado, obtenerToken, registrarCliente, sufijo } from './ayudantes.js';

/**
 * CU-SEG-03 Gestionar Rol — la baja de roles.
 *
 * No existía: los roles se creaban y se editaban, pero uno creado por error
 * quedaba para siempre en la lista. Lo delicado no es borrar, sino **qué no
 * se puede borrar**: un rol con usuarios los dejaría sin rol, y el rol Cliente
 * lo necesita el autorregistro por su nombre.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

async function idsDePermisos(admin: string, nombres: string[]): Promise<number[]> {
  const r = await request(app).get('/api/roles/permisos').set(cabecera(admin));
  return r.body
    .filter((p: { nombre: string }) => nombres.includes(p.nombre))
    .map((p: { id: number }) => p.id);
}

async function crearRol(admin: string, permisos: string[] = []) {
  const r = await request(app)
    .post('/api/roles')
    .set(cabecera(admin))
    .send({ nombre: `Rol ${sufijo()}`, idsPermiso: await idsDePermisos(admin, permisos) });
  expect(r.status).toBe(201);
  return r.body as { id: number; nombre: string };
}

async function rolPorNombre(admin: string, nombre: string) {
  const r = await request(app).get('/api/roles').set(cabecera(admin));
  return r.body.find((rol: { nombre: string }) => rol.nombre === nombre) as {
    id: number;
    nombre: string;
    permisos: { id: number }[];
  };
}

/** Da de alta a alguien de personal interno con el rol indicado. */
async function crearUsuarioConRol(admin: string, idRol: number): Promise<number> {
  const cargos = await request(app).get('/api/cargos').set(cabecera(admin));
  const nombreUsuario = `u${sufijo()}`;
  const r = await request(app)
    .post('/api/usuarios')
    .set(cabecera(admin))
    .send({
      nombre: 'Usuario',
      apellido: 'De Prueba',
      email: `${nombreUsuario}@nutriexpress.bo`,
      nombreUsuario,
      contrasena: 'Clave1234!',
      idRol,
      idCargo: cargos.body[0].id,
    });
  expect(r.status).toBe(201);
  return r.body.id as number;
}

describe('CU-SEG-03 · Eliminar un rol', () => {
  it('elimina un rol sin usuarios y deja de existir', async () => {
    const admin = await obtenerToken();
    const rol = await crearRol(admin);

    const r = await request(app).delete(`/api/roles/${rol.id}`).set(cabecera(admin));
    expect(r.status).toBe(204);

    const despues = await request(app).get(`/api/roles/${rol.id}`).set(cabecera(admin));
    expect(despues.status).toBe(404);
  });

  /** Los `rol_permiso` cuelgan del rol: sin quitarlos, la clave foránea lo impide. */
  it('elimina también un rol que tenía permisos definidos', async () => {
    const admin = await obtenerToken();
    const rol = await crearRol(admin, ['PEDIDO_LEER', 'STOCK_CONSULTAR']);

    const r = await request(app).delete(`/api/roles/${rol.id}`).set(cabecera(admin));
    expect(r.status).toBe(204);
  });

  it('no elimina un rol que todavía tiene usuarios, y dice cuántos', async () => {
    const admin = await obtenerToken();
    const rol = await crearRol(admin, ['PEDIDO_LEER']);
    await crearUsuarioConRol(admin, rol.id);

    const r = await request(app).delete(`/api/roles/${rol.id}`).set(cabecera(admin));

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('1 usuario(s)');

    const sigue = await request(app).get(`/api/roles/${rol.id}`).set(cabecera(admin));
    expect(sigue.status).toBe(200);
  });

  /**
   * Cambiar de rol a un usuario deja sus habilitaciones del rol anterior en
   * `usuario_rol_permiso`. El rol queda vacío, pero esas filas siguen
   * apuntando a sus `rol_permiso`: sin limpiarlas, la clave foránea no dejaría
   * borrar un rol que ya nadie tiene.
   */
  it('elimina un rol que quedó vacío aunque dejara habilitaciones sueltas', async () => {
    const admin = await obtenerToken();
    const rol = await crearRol(admin, ['PEDIDO_LEER']);
    const idUsuario = await crearUsuarioConRol(admin, rol.id);

    const empleado = await rolPorNombre(admin, 'Empleado');
    await request(app)
      .put(`/api/usuarios/${idUsuario}`)
      .set(cabecera(admin))
      .send({ idRol: empleado.id })
      .expect(200);

    const r = await request(app).delete(`/api/roles/${rol.id}`).set(cabecera(admin));
    expect(r.status).toBe(204);
  });

  it('no elimina el rol Cliente, que el autorregistro necesita', async () => {
    const admin = await obtenerToken();
    const cliente = await rolPorNombre(admin, 'Cliente');

    const r = await request(app).delete(`/api/roles/${cliente.id}`).set(cabecera(admin));

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('registro de clientes');
    // Y el registro sigue funcionando.
    await registrarCliente();
  });

  it('responde 404 si el rol no existe', async () => {
    const admin = await obtenerToken();
    const r = await request(app).delete('/api/roles/999999').set(cabecera(admin));
    expect(r.status).toBe(404);
  });

  /** «Obviamente solo lo podría hacer el admin»: lo decide el permiso, en el servidor. */
  it('sin el permiso ROL_GESTIONAR no se puede eliminar', async () => {
    const admin = await obtenerToken();
    const rol = await crearRol(admin);
    const empleado = await crearEmpleado('Cocinero');

    const r = await request(app).delete(`/api/roles/${rol.id}`).set(cabecera(empleado.token));
    expect(r.status).toBe(403);

    const sigue = await request(app).get(`/api/roles/${rol.id}`).set(cabecera(admin));
    expect(sigue.status).toBe(200);
  });
});

/**
 * Renombrar el rol Cliente rompía lo mismo que borrarlo —el autorregistro lo
 * busca por su nombre— y además hacía que todos los clientes pasaran a contar
 * como personal interno. Se cierra la misma puerta por los dos lados.
 */
describe('CU-SEG-03 · El rol Cliente', () => {
  it('no se puede renombrar', async () => {
    const admin = await obtenerToken();
    const cliente = await rolPorNombre(admin, 'Cliente');

    const r = await request(app)
      .put(`/api/roles/${cliente.id}`)
      .set(cabecera(admin))
      .send({ nombre: 'Clientes', idsPermiso: cliente.permisos.map((p) => p.id) });

    expect(r.status).toBe(409);
    expect((await rolPorNombre(admin, 'Cliente')).id).toBe(cliente.id);
  });

  it('sus permisos sí se pueden editar', async () => {
    const admin = await obtenerToken();
    const cliente = await rolPorNombre(admin, 'Cliente');
    const ids = cliente.permisos.map((p) => p.id);

    const r = await request(app)
      .put(`/api/roles/${cliente.id}`)
      .set(cabecera(admin))
      .send({ nombre: 'Cliente', idsPermiso: ids });

    expect(r.status).toBe(200);
  });
});
