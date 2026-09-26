import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { crearEmpleado, obtenerToken } from './ayudantes.js';

/**
 * CU-SEG-02 / CU-SEG-04 — lo que el administrador no decide sobre sí mismo, y
 * la baja como algo reversible.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

/** El token del administrador y su propio identificador. */
async function administrador() {
  const token = await obtenerToken();
  const perfil = await request(app).get('/api/perfil').set(cabecera(token));
  return { token, id: perfil.body.id as number };
}

describe('Usuarios · la cuenta propia', () => {
  it('no puede darse de baja a sí mismo', async () => {
    const admin = await administrador();

    const r = await request(app).delete(`/api/usuarios/${admin.id}`).set(cabecera(admin.token));

    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/otro administrador/);
    // Y la sesión sigue sirviendo: la baja no llegó a aplicarse.
    await request(app).get('/api/usuarios').set(cabecera(admin.token)).expect(200);
  });

  it('no puede cambiarse el rol, pero sí sus datos personales', async () => {
    const admin = await administrador();
    const roles = await request(app).get('/api/roles').set(cabecera(admin.token));
    const empleado = roles.body.find((r: { nombre: string }) => r.nombre === 'Empleado');
    const actual = await request(app).get(`/api/usuarios/${admin.id}`).set(cabecera(admin.token));
    const idRolActual = roles.body.find((r: { nombre: string }) => r.nombre === actual.body.rol).id;

    const cambioDeRol = await request(app)
      .put(`/api/usuarios/${admin.id}`)
      .set(cabecera(admin.token))
      .send({ idRol: empleado.id });

    // El formulario siempre manda el rol: si es el mismo, no es un cambio.
    const soloDatos = await request(app)
      .put(`/api/usuarios/${admin.id}`)
      .set(cabecera(admin.token))
      .send({ telefono: '70000001', idRol: idRolActual });

    expect(cambioDeRol.status).toBe(403);
    expect(soloDatos.status).toBe(200);
    expect(soloDatos.body.rol).toBe(actual.body.rol);
  });

  it('no puede cambiarse sus propios permisos', async () => {
    const admin = await administrador();

    const r = await request(app)
      .put(`/api/usuarios/${admin.id}/permisos`)
      .set(cabecera(admin.token))
      .send({ idsRolPermiso: [] });

    expect(r.status).toBe(403);
    // Conserva lo que tenía: sigue pudiendo administrar usuarios.
    await request(app).get('/api/usuarios').set(cabecera(admin.token)).expect(200);
  });

  it('sí puede hacerle esos cambios a otra cuenta', async () => {
    const admin = await administrador();
    const empleado = await crearEmpleado('Vendedor');

    await request(app)
      .put(`/api/usuarios/${empleado.id}/permisos`)
      .set(cabecera(admin.token))
      .send({ idsRolPermiso: [] })
      .expect(200);
    await request(app).delete(`/api/usuarios/${empleado.id}`).set(cabecera(admin.token)).expect(204);
  });
});

describe('Usuarios · reactivar una baja', () => {
  it('la cuenta vuelve a poder iniciar sesión', async () => {
    const admin = await administrador();
    const empleado = await crearEmpleado('Vendedor');
    await request(app).delete(`/api/usuarios/${empleado.id}`).set(cabecera(admin.token)).expect(204);

    const r = await request(app)
      .post(`/api/usuarios/${empleado.id}/reactivar`)
      .set(cabecera(admin.token));

    expect(r.status).toBe(200);
    expect(r.body.activo).toBe(true);
    expect(r.body.bloqueado).toBe(false);
    await obtenerToken(empleado.nombreUsuario, 'Empleado1234!');
  });

  it('una cuenta activa no se reactiva', async () => {
    const admin = await administrador();
    const empleado = await crearEmpleado('Vendedor');

    const r = await request(app)
      .post(`/api/usuarios/${empleado.id}/reactivar`)
      .set(cabecera(admin.token));

    expect(r.status).toBe(409);
  });

  it('pide el mismo permiso que la baja', async () => {
    const empleado = await crearEmpleado('Vendedor');
    const otro = await crearEmpleado('Vendedor');

    const r = await request(app)
      .post(`/api/usuarios/${otro.id}/reactivar`)
      .set(cabecera(empleado.token));

    expect(r.status).toBe(403);
  });

  it('la edición ya no cambia el estado de la cuenta: eso es de la baja', async () => {
    // Con `activo` en la edición, bastaba USUARIO_EDITAR para dar de baja.
    const admin = await administrador();
    const empleado = await crearEmpleado('Vendedor');

    await request(app)
      .put(`/api/usuarios/${empleado.id}`)
      .set(cabecera(admin.token))
      .send({ activo: false })
      .expect(200);

    const despues = await request(app)
      .get(`/api/usuarios/${empleado.id}`)
      .set(cabecera(admin.token));
    expect(despues.body.activo).toBe(true);
  });
});
