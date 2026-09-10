import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { crearEmpleado, obtenerToken, registrarCliente, sufijo } from './ayudantes.js';

/**
 * Autoservicio de la cuenta propia.
 *
 * Un solo conjunto de rutas para empleados y clientes. Lo que se prueba aquí
 * no es solo que funcione, sino **que no permita más de lo que debe**: el
 * titular administra lo suyo y nada más.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Consultar el perfil propio', () => {
  it('el empleado ve sus datos laborales', async () => {
    const empleado = await crearEmpleado('Vendedor');
    const r = await request(app).get('/api/perfil').set(cabecera(empleado.token));

    expect(r.status).toBe(200);
    expect(r.body.nombreUsuario).toBe(empleado.nombreUsuario);
    expect(r.body.rol).toBe('Empleado');
    expect(r.body.laboral.cargo).toBe('Vendedor');
    expect(r.body.laboral.fechaIngreso).toBeTruthy();
    // Un empleado no tiene preferencias alimentarias.
    expect(r.body.preferencias).toBeNull();
  });

  it('el cliente ve sus preferencias y no datos laborales', async () => {
    const cliente = await registrarCliente();
    const r = await request(app).get('/api/perfil').set(cabecera(cliente.token));

    expect(r.status).toBe(200);
    expect(r.body.laboral).toBeNull();
    expect(r.body.preferencias).not.toBeNull();
  });

  /** Sirve para que el titular note un acceso que no hizo él. */
  it('registra el último acceso al iniciar sesión', async () => {
    const cliente = await registrarCliente();
    const r = await request(app).get('/api/perfil').set(cabecera(cliente.token));
    expect(r.body.ultimoAcceso).toBeTruthy();
  });

  it('sin sesión no hay perfil que ver', async () => {
    const r = await request(app).get('/api/perfil');
    expect(r.status).toBe(401);
  });
});

describe('Editar el perfil propio', () => {
  it('el empleado puede corregir sus propios datos', async () => {
    const empleado = await crearEmpleado('Vendedor');

    const r = await request(app)
      .put('/api/perfil')
      .set(cabecera(empleado.token))
      .send({ telefono: '76543210', nombre: 'Nombre Corregido' });

    expect(r.status).toBe(200);
    expect(r.body.telefono).toBe('76543210');
    expect(r.body.nombre).toBe('Nombre Corregido');
  });

  /**
   * El nombre de usuario firma las ventas y las órdenes: cambiarlo rompería la
   * lectura del historial. El rol define qué puede hacer: si el titular
   * pudiera tocarlo, el control de acceso no controlaría nada.
   */
  it('ignora los campos que el titular no puede cambiar', async () => {
    const empleado = await crearEmpleado('Vendedor');
    const antes = await request(app).get('/api/perfil').set(cabecera(empleado.token));

    await request(app)
      .put('/api/perfil')
      .set(cabecera(empleado.token))
      .send({
        nombre: 'Sigue Siendo Editable',
        nombreUsuario: 'usurpador',
        rol: 'Administrador',
        idRol: 1,
        activo: false,
      })
      .expect(200);

    const despues = await request(app).get('/api/perfil').set(cabecera(empleado.token));
    expect(despues.body.nombre).toBe('Sigue Siendo Editable');
    expect(despues.body.nombreUsuario).toBe(antes.body.nombreUsuario);
    expect(despues.body.rol).toBe(antes.body.rol);
  });

  it('rechaza un correo que ya usa otra cuenta', async () => {
    const otro = await registrarCliente();
    const perfilOtro = await request(app).get('/api/perfil').set(cabecera(otro.token));

    const cliente = await registrarCliente();
    const r = await request(app)
      .put('/api/perfil')
      .set(cabecera(cliente.token))
      .send({ email: perfilOtro.body.email });

    expect(r.status).toBe(409);
    expect(r.body.error).toContain('ya está registrado');
  });

  it('rechaza un correo mal formado', async () => {
    const cliente = await registrarCliente();
    const r = await request(app)
      .put('/api/perfil')
      .set(cabecera(cliente.token))
      .send({ email: 'no-es-un-correo' });

    expect(r.status).toBe(400);
  });
});

describe('Cambiar la contraseña propia', () => {
  const ACTUAL = 'Cliente1234!';

  it('exige la contraseña actual aunque la sesión esté abierta', async () => {
    const cliente = await registrarCliente();

    const r = await request(app)
      .put('/api/perfil/contrasena')
      .set(cabecera(cliente.token))
      .send({ contrasenaActual: 'LaQueNoEs1!', contrasenaNueva: 'NuevaClave1!' });

    expect(r.status).toBe(401);
    expect(r.body.error).toContain('actual no es correcta');
  });

  it('aplica la política de RF-SEG-03 a la contraseña nueva', async () => {
    const cliente = await registrarCliente();

    const r = await request(app)
      .put('/api/perfil/contrasena')
      .set(cabecera(cliente.token))
      .send({ contrasenaActual: ACTUAL, contrasenaNueva: 'simple' });

    expect(r.status).toBe(400);
  });

  it('no acepta repetir la contraseña que ya tenía', async () => {
    const cliente = await registrarCliente();

    const r = await request(app)
      .put('/api/perfil/contrasena')
      .set(cabecera(cliente.token))
      .send({ contrasenaActual: ACTUAL, contrasenaNueva: ACTUAL });

    expect(r.status).toBe(400);
  });

  it('la cambia, y la nueva es la que sirve para entrar', async () => {
    const cliente = await registrarCliente();
    const NUEVA = 'OtraClave2026!';

    await request(app)
      .put('/api/perfil/contrasena')
      .set(cabecera(cliente.token))
      .send({ contrasenaActual: ACTUAL, contrasenaNueva: NUEVA })
      .expect(204);

    // La anterior deja de servir.
    const conVieja = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: cliente.nombreUsuario, contrasena: ACTUAL });
    expect(conVieja.status).toBe(401);

    // La nueva entra.
    const conNueva = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: cliente.nombreUsuario, contrasena: NUEVA });
    expect(conNueva.status).toBe(200);
  });
});

describe('Preferencias alimentarias', () => {
  it('el cliente las administra desde su perfil', async () => {
    const cliente = await registrarCliente();

    const r = await request(app)
      .put('/api/perfil/preferencias')
      .set(cabecera(cliente.token))
      .send({ preferenciaAlimentaria: 'Vegetariana', restriccionDietetica: 'Sin gluten' });

    expect(r.status).toBe(200);
    expect(r.body.preferencias.preferenciaAlimentaria).toBe('Vegetariana');
    expect(r.body.preferencias.restriccionDietetica).toBe('Sin gluten');
  });

  it('un empleado no tiene preferencias que administrar', async () => {
    const empleado = await crearEmpleado('Vendedor');
    const r = await request(app)
      .put('/api/perfil/preferencias')
      .set(cabecera(empleado.token))
      .send({ preferenciaAlimentaria: 'Vegetariana' });

    expect(r.status).toBe(403);
  });
});

describe('Un titular no alcanza la cuenta de otro', () => {
  it('el identificador sale de la sesión, no de la URL', async () => {
    const cliente = await registrarCliente();

    // No existe `/api/perfil/:id`: la ruta con un identificador no es un
    // perfil ajeno sino otra cosa, y aquí debe fallar.
    const r = await request(app)
      .put(`/api/perfil/${sufijo()}`)
      .set(cabecera(cliente.token))
      .send({ nombre: 'Intento' });

    expect(r.status).toBe(404);
  });

  it('un cliente no puede editar usuarios por la vía del personal', async () => {
    const cliente = await registrarCliente();
    const admin = await obtenerToken();
    const otros = await request(app).get('/api/usuarios').set(cabecera(admin));

    const r = await request(app)
      .put(`/api/usuarios/${otros.body.datos[0].id}`)
      .set(cabecera(cliente.token))
      .send({ nombre: 'Usurpado' });

    expect(r.status).toBe(403);
  });
});
