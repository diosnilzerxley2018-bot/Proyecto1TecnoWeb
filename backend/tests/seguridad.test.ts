import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { crearEmpleado, obtenerToken, registrarCliente, sufijo } from './ayudantes.js';
import { prisma } from '../src/config/prisma.js';

/**
 * Hallazgos H8 y H9 — las dos caras del bloqueo de cuentas.
 *
 * H8: el bloqueo por intentos protegía una cuenta y a la vez permitía
 * inutilizarlas todas.
 * H9: bloquear a alguien le impedía volver a entrar, pero no le impedía seguir
 * trabajando con la sesión que ya tenía abierta.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

const entrar = (nombreUsuario: string, contrasena: string) =>
  request(app).post('/api/auth/login').send({ nombreUsuario, contrasena });

describe('H9 · La sesión se contrasta con el estado de la cuenta', () => {
  /**
   * El caso concreto: un empleado despedido a las nueve de la mañana seguía
   * registrando ventas hasta las cinco de la tarde, porque su token duraba
   * ocho horas y nadie miraba si la cuenta seguía habilitada.
   */
  it('dar de baja a un usuario corta su sesión abierta', async () => {
    const admin = await obtenerToken();
    const empleado = await crearEmpleado('Vendedor');

    // Con la sesión abierta, trabaja normalmente.
    await request(app).get('/api/perfil').set(cabecera(empleado.token)).expect(200);

    await request(app)
      .delete(`/api/usuarios/${empleado.id}`)
      .set(cabecera(admin))
      .expect(204);

    // El mismo token, que no venció, ya no sirve.
    const despues = await request(app).get('/api/perfil').set(cabecera(empleado.token));
    expect(despues.status).toBe(401);
    expect(despues.body.error).toContain('dada de baja');
  });

  it('bloquear una cuenta corta su sesión abierta', async () => {
    const empleado = await crearEmpleado('Cocinero');
    await request(app).get('/api/perfil').set(cabecera(empleado.token)).expect(200);

    // Tres intentos fallidos desde otra parte bloquean la cuenta.
    for (let i = 0; i < 3; i += 1) {
      await entrar(empleado.nombreUsuario, 'ClaveEquivocada1!');
    }

    const despues = await request(app).get('/api/perfil').set(cabecera(empleado.token));
    expect(despues.status).toBe(401);
    expect(despues.body.error).toContain('bloqueada');
  });

  it('la comprobación alcanza a todas las rutas, no solo al perfil', async () => {
    const admin = await obtenerToken();
    const empleado = await crearEmpleado('Vendedor');

    await request(app).get('/api/gestion/pedidos').set(cabecera(empleado.token)).expect(200);
    await request(app).delete(`/api/usuarios/${empleado.id}`).set(cabecera(admin)).expect(204);

    const r = await request(app).get('/api/gestion/pedidos').set(cabecera(empleado.token));
    expect(r.status).toBe(401);
  });

  it('una sesión de una cuenta habilitada sigue funcionando', async () => {
    const cliente = await registrarCliente();
    await request(app).get('/api/perfil').set(cabecera(cliente.token)).expect(200);
    await request(app).get('/api/perfil').set(cabecera(cliente.token)).expect(200);
  });
});

describe('H8 · El bloqueo se libera solo', () => {
  /**
   * CU-SEG-05, variación nueva. Un bloqueo sin salida automática convierte un
   * ataque de un minuto en una interrupción de un día, y cuando le toca al
   * administrador deja al sistema sin nadie capaz de reabrirlo.
   */
  it('el mensaje dice cuánto falta, en vez de mandar a buscar al administrador', async () => {
    const empleado = await crearEmpleado('Vendedor');

    for (let i = 0; i < 3; i += 1) {
      await entrar(empleado.nombreUsuario, 'ClaveEquivocada1!');
    }

    const r = await entrar(empleado.nombreUsuario, 'Empleado1234!');
    expect(r.status).toBe(423);
    expect(r.body.error).toMatch(/minuto/i);
  });

  it('avisa cuántos intentos quedan antes de bloquear', async () => {
    const empleado = await crearEmpleado('Vendedor');

    const primera = await entrar(empleado.nombreUsuario, 'ClaveEquivocada1!');
    expect(primera.status).toBe(401);
    expect(primera.body.error).toContain('intento');
  });

  it('un acceso correcto reinicia el contador', async () => {
    const empleado = await crearEmpleado('Vendedor');

    await entrar(empleado.nombreUsuario, 'ClaveEquivocada1!');
    await entrar(empleado.nombreUsuario, 'Empleado1234!').expect(200);

    // Tras entrar bien, vuelve a tener los tres intentos completos.
    const fallida = await entrar(empleado.nombreUsuario, 'ClaveEquivocada1!');
    expect(fallida.status).toBe(401);
    expect(fallida.body.error).toContain('2');
  });

  /**
   * El agujero entre H8 y H9: el middleware miraba la bandera `bloqueado` sin
   * saber que caduca.
   *
   * Consecuencia real: cualquiera que supiera el nombre de usuario del
   * administrador lo **expulsaba de su sesión** con tres intentos fallidos, y
   * el plazo cumplido no lo devolvía a trabajar —la bandera seguía encendida
   * hasta que alguien intentara iniciar sesión—. El bloqueo protegía la cuenta
   * y a la vez servía para echar a quien sabía la contraseña.
   */
  it('cumplido el plazo, la sesión abierta vuelve a funcionar sola', async () => {
    const empleado = await crearEmpleado('Vendedor');
    await request(app).get('/api/perfil').set(cabecera(empleado.token)).expect(200);

    for (let i = 0; i < 3; i += 1) {
      await entrar(empleado.nombreUsuario, 'ClaveEquivocada1!');
    }

    // Mientras el bloqueo está vigente, la sesión queda cortada.
    const durante = await request(app).get('/api/perfil').set(cabecera(empleado.token));
    expect(durante.status).toBe(401);
    expect(durante.body.error).toMatch(/minuto/i);

    // Se envejece el bloqueo para simular que el plazo ya venció.
    await prisma.usuario.update({
      where: { id_usuario: empleado.id },
      data: { fecha_bloqueo: new Date(Date.now() - 86_400_000) },
    });

    // El mismo token, sin volver a iniciar sesión, vuelve a servir.
    await request(app).get('/api/perfil').set(cabecera(empleado.token)).expect(200);
  });

  /** Y la bandera queda apagada en la base, no solo ignorada. */
  it('el plazo cumplido apaga el bloqueo en la base', async () => {
    const empleado = await crearEmpleado('Cocinero');

    for (let i = 0; i < 3; i += 1) {
      await entrar(empleado.nombreUsuario, 'ClaveEquivocada1!');
    }
    await prisma.usuario.update({
      where: { id_usuario: empleado.id },
      data: { fecha_bloqueo: new Date(Date.now() - 86_400_000) },
    });

    await request(app).get('/api/perfil').set(cabecera(empleado.token)).expect(200);

    const cuenta = await prisma.usuario.findUnique({
      where: { id_usuario: empleado.id },
      select: { bloqueado: true },
    });
    expect(cuenta?.bloqueado).toBe(false);
  });

  it('el administrador puede desbloquear sin esperar el plazo', async () => {
    const admin = await obtenerToken();
    const empleado = await crearEmpleado('Vendedor');

    for (let i = 0; i < 3; i += 1) {
      await entrar(empleado.nombreUsuario, 'ClaveEquivocada1!');
    }

    await request(app)
      .post(`/api/usuarios/${empleado.id}/desbloquear`)
      .set(cabecera(admin))
      .expect(200);

    await entrar(empleado.nombreUsuario, 'Empleado1234!').expect(200);
  });
});

describe('Cabeceras de seguridad', () => {
  /** RNF-SEG-03 y RNF-SEG-06: lo que `helmet` agrega a cada respuesta. */
  it('la API responde con las cabeceras de protección', async () => {
    const r = await request(app).get('/api/health');

    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBeDefined();
    // Ocultar la tecnología del servidor es lo mínimo frente a un escaneo.
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
});

describe('Límite de intentos por dirección IP', () => {
  /**
   * El **registro** lo conserva; el **inicio de sesión** ya no.
   *
   * En el login, el límite por IP contaba juntos los intentos de todas las
   * cuentas: tres contraseñas mal en tres cuentas distintas dejaban fuera al
   * navegador entero, y también al de al lado y al teléfono de la misma red,
   * incluso para quien no se habia equivocado nunca. Encima tapaba el aviso de
   * la cuenta bloqueada con uno sobre la conexión. Lo que se bloquea es la
   * cuenta (CU-SEG-05), y de eso se encarga la escalada por cuenta.
   *
   * En el registro el razonamiento no aplica: ahí no hay ninguna cuenta a la
   * que culpar, y sin tope cualquiera crea miles.
   */
  it('el inicio de sesión ya no lleva límite por conexión', async () => {
    const r = await entrar('noexiste', 'LoQueSea1!');

    expect(r.headers['ratelimit-limit']).toBeUndefined();
    expect(r.body.error).not.toContain('conexión');
  });

  it('el registro sí sigue protegido', async () => {
    const nombreUsuario = `nuevo${sufijo()}`;
    const r = await request(app).post('/api/auth/registro').send({
      nombre: 'Cliente',
      apellido: 'Nuevo',
      email: `${nombreUsuario}@correo.bo`,
      nombreUsuario,
      contrasena: 'Cliente1234!',
    });

    expect(r.status).toBeLessThan(400);
    expect(r.headers['ratelimit-limit']).toBeDefined();
  });

  /** Quien entra bien nunca se queda sin poder entrar por culpa de otro. */
  it('equivocarse muchas veces no impide entrar a quien acierta', async () => {
    const empleado = await crearEmpleado('Vendedor');

    for (let i = 0; i < 12; i++) await entrar(`fantasma${sufijo()}`, 'LoQueSea1!');

    const r = await entrar(empleado.nombreUsuario, 'Empleado1234!');
    expect(r.status).toBe(200);
  });
});
