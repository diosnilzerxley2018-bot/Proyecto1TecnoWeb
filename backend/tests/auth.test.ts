import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { crearEmpleado, obtenerToken, registrarCliente, sufijo } from './ayudantes.js';

describe('CU-SEG-01 Iniciar sesión', () => {
  it('autentica al administrador y devuelve sus permisos', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: 'admin', contrasena: 'Admin1234!' });

    expect(r.status).toBe(200);
    expect(r.body.usuario.rol).toBe('Administrador');
    expect(r.body.permisos.length).toBeGreaterThan(0);
    expect(r.body.token).toBeTypeOf('string');
  });

  it('nunca expone el hash de la contraseña', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: 'admin', contrasena: 'Admin1234!' });

    expect(JSON.stringify(r.body)).not.toContain('contrasena_hash');
  });

  it('rechaza credenciales incorrectas sin revelar si el usuario existe', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: 'noexiste', contrasena: 'loquesea' });

    expect(r.status).toBe(401);
    expect(r.body.error).toBe('Credenciales incorrectas');
  });
});

describe('RF-SEG-03 Política de contraseñas', () => {
  const CASOS: [string, string][] = [
    ['sin mayúscula', 'correcta123!'],
    ['sin minúscula', 'CORRECTA123!'],
    ['sin número', 'Correctaaa!'],
    ['sin carácter especial', 'Correcta123'],
    ['demasiado corta', 'Ab1!'],
  ];

  it.each(CASOS)('rechaza una contraseña %s', async (_caso, contrasena) => {
    const token = await obtenerToken();
    const usuario = `debil${sufijo()}`;

    const r = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Prueba', apellido: 'Politica',
        email: `${usuario}@correo.bo`,
        nombreUsuario: usuario, contrasena,
        idRol: 2, idCargo: 2,
      });

    expect(r.status).toBe(400);
  });

  it('acepta una contraseña que cumple los cuatro criterios', async () => {
    const token = await obtenerToken();
    const usuario = `fuerte${sufijo()}`;

    const r = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Prueba', apellido: 'Politica',
        email: `${usuario}@correo.bo`,
        nombreUsuario: usuario, contrasena: 'Correcta123!',
        idRol: 2, idCargo: 2,
      });

    expect(r.status).toBe(201);
  });

  it('también rige para el autorregistro del cliente', async () => {
    const usuario = `portal${sufijo()}`;

    const r = await request(app).post('/api/auth/registro').send({
      nombre: 'Cliente', apellido: 'Debil',
      email: `${usuario}@correo.bo`,
      nombreUsuario: usuario, contrasena: 'sinmayuscula1',
    });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('mayúscula');
  });
});

describe('CU-SEG-05 Bloquear cuenta por intentos fallidos', () => {
  it('bloquea la cuenta al tercer intento y la rechaza aunque acierte después', async () => {
    const token = await obtenerToken();
    const usuario = `prueba${sufijo()}`;

    const creado = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Prueba', apellido: 'Bloqueo',
        email: `${usuario}@correo.bo`,
        nombreUsuario: usuario, contrasena: 'Correcta123!',
        idRol: 2, idCargo: 2,
      });
    expect(creado.status).toBe(201);

    // Dos intentos fallidos: informan cuántos quedan
    for (const restantes of [2, 1]) {
      const r = await request(app)
        .post('/api/auth/login')
        .send({ nombreUsuario: usuario, contrasena: 'incorrecta' });
      expect(r.status).toBe(401);
      expect(r.body.error).toContain(`${restantes} intento`);
    }

    // Tercer intento: bloquea
    const tercero = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: usuario, contrasena: 'incorrecta' });
    expect(tercero.status).toBe(423);

    // La contraseña correcta ya no sirve
    const conCorrecta = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: usuario, contrasena: 'Correcta123!' });
    expect(conCorrecta.status).toBe(423);

    // El administrador desbloquea y vuelve a funcionar
    await request(app)
      .post(`/api/usuarios/${creado.body.id}/desbloquear`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const trasDesbloqueo = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: usuario, contrasena: 'Correcta123!' });
    expect(trasDesbloqueo.status).toBe(200);
  });
});

describe('RNF-SEG-06 Autenticación de cada petición', () => {
  it('rechaza el acceso sin token', async () => {
    const r = await request(app).get('/api/usuarios');
    expect(r.status).toBe(401);
  });

  it('rechaza un token inválido', async () => {
    const r = await request(app).get('/api/usuarios').set('Authorization', 'Bearer basura');
    expect(r.status).toBe(401);
  });
});

describe('CU-SEG-02 · El usuario creado nace con los permisos de su rol', () => {
  /**
   * Regresión. `requierePermiso` consulta `usuario_rol_permiso`, no el rol, y
   * el alta no llenaba esa tabla: el empleado recién creado podía iniciar
   * sesión y recibía 403 en todo. El error estaba oculto porque las pruebas
   * que usaban `crearEmpleado` solo tocaban rutas sin permiso.
   */
  it('un empleado recién creado puede usar el sistema, no solo entrar', async () => {
    const empleado = await crearEmpleado('Vendedor');
    const cabecera = { Authorization: `Bearer ${empleado.token}` };

    // Entra...
    const perfil = await request(app).get('/api/perfil').set(cabecera);
    expect(perfil.status).toBe(200);

    // ...y además puede hacer lo que su rol le permite.
    const pedidos = await request(app).get('/api/gestion/pedidos').set(cabecera);
    expect(pedidos.status).toBe(200);

    const stock = await request(app).get('/api/stock').set(cabecera);
    expect(stock.status).toBe(200);
  });

  it('un cliente recién registrado también', async () => {
    const cliente = await registrarCliente();
    const r = await request(app)
      .get('/api/pedidos')
      .set('Authorization', `Bearer ${cliente.token}`);
    expect(r.status).toBe(200);
  });
});

/**
 * RNF-SEG — el rol es lo que manda, también al cambiarlo.
 *
 * `requierePermiso` consulta `usuario_rol_permiso` sin mirar el rol actual, así
 * que las habilitaciones del rol anterior seguían valiendo después de un
 * cambio: se podía degradar a un administrador y **conservaba sus permisos de
 * administrador**. Como Administrador y Empleado son los dos personal interno,
 * el cambio entre ellos está permitido y el agujero era alcanzable.
 */
describe('CU-SEG-02 · Al cambiar de rol, cambian los permisos', () => {
  it('pierde los del rol anterior y recibe los del nuevo', async () => {
    const admin = await obtenerToken();
    const cabeceraAdmin = { Authorization: `Bearer ${admin}` };

    const permisos = (await request(app).get('/api/roles/permisos').set(cabeceraAdmin)).body;
    const usuarioLeer = permisos.find((p: { nombre: string }) => p.nombre === 'USUARIO_LEER');

    const alto = (
      await request(app)
        .post('/api/roles')
        .set(cabeceraAdmin)
        .send({ nombre: `Supervisor ${sufijo()}`, idsPermiso: [usuarioLeer.id] })
    ).body;

    const cargos = (await request(app).get('/api/cargos').set(cabeceraAdmin)).body;
    const nombreUsuario = `sup${sufijo()}`;
    const creado = await request(app)
      .post('/api/usuarios')
      .set(cabeceraAdmin)
      .send({
        nombre: 'Sup',
        apellido: 'Ervisor',
        email: `${nombreUsuario}@nutriexpress.bo`,
        nombreUsuario,
        contrasena: 'Clave1234!',
        idRol: alto.id,
        idCargo: cargos[0].id,
      })
      .expect(201);

    const token = await obtenerToken(nombreUsuario, 'Clave1234!');
    const cabecera = { Authorization: `Bearer ${token}` };

    // Con el rol alto entra al listado de usuarios.
    await request(app).get('/api/usuarios').set(cabecera).expect(200);

    const roles = (await request(app).get('/api/roles').set(cabeceraAdmin)).body;
    const empleado = roles.find((r: { nombre: string }) => r.nombre === 'Empleado');
    expect(empleado.permisos.some((p: { nombre: string }) => p.nombre === 'USUARIO_LEER')).toBe(false);

    await request(app)
      .put(`/api/usuarios/${creado.body.id}`)
      .set(cabeceraAdmin)
      .send({ idRol: empleado.id })
      .expect(200);

    // Ya no: el permiso era del rol que dejó de tener.
    const despues = await request(app).get('/api/usuarios').set(cabecera);
    expect(despues.status).toBe(403);

    // Y sí puede lo del rol nuevo, que hereda como si lo acabaran de dar de alta.
    await request(app).get('/api/gestion/pedidos').set(cabecera).expect(200);
  });
});
