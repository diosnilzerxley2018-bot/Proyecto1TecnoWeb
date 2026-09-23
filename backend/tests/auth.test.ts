import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
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

/**
 * CU-SEG-05 — el bloqueo escala: 1 minuto, 5 minutos, y despues definitivo.
 *
 * Sin escalada habia que elegir entre un plazo corto, que no frena a quien
 * prueba contrasenas, y uno largo, que castiga al dueno que se equivoco. La
 * progresion resuelve las dos: al distraido apenas lo demora, al insistente lo
 * deja fuera. La prueba adelanta el reloj tocando `fecha_bloqueo` en vez de
 * esperar los minutos de verdad.
 */
describe('CU-SEG-05 · La escalada del bloqueo', () => {
  /** Crea una cuenta propia para no interferir con otras pruebas. */
  async function cuentaNueva(tokenAdmin: string) {
    const usuario = `escal${sufijo()}`;
    const creado = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        nombre: 'Prueba', apellido: 'Escalada',
        email: `${usuario}@correo.bo`,
        nombreUsuario: usuario, contrasena: 'Correcta123!',
        idRol: 2, idCargo: 2,
      })
      .expect(201);
    return { usuario, id: creado.body.id as number };
  }

  /** Gasta los tres intentos y devuelve la respuesta del que bloquea. */
  async function agotarIntentos(usuario: string) {
    let ultima;
    for (let i = 0; i < 3; i++) {
      ultima = await request(app)
        .post('/api/auth/login')
        .send({ nombreUsuario: usuario, contrasena: 'incorrecta' });
    }
    return ultima!;
  }

  /** Da por cumplido el plazo sin esperarlo. */
  const vencerElPlazo = (id: number) =>
    prisma.usuario.update({
      where: { id_usuario: id },
      data: { fecha_bloqueo: new Date(Date.now() - 60 * 60_000) },
    });

  it('el primer bloqueo dura un minuto y se levanta solo', async () => {
    const admin = await obtenerToken();
    const { usuario, id } = await cuentaNueva(admin);

    const bloqueo = await agotarIntentos(usuario);
    expect(bloqueo.status).toBe(423);
    expect(bloqueo.body.error).toContain('1 minuto');

    await vencerElPlazo(id);

    const despues = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: usuario, contrasena: 'Correcta123!' });
    expect(despues.status).toBe(200);
  });

  it('el segundo dura cinco minutos', async () => {
    const admin = await obtenerToken();
    const { usuario, id } = await cuentaNueva(admin);

    await agotarIntentos(usuario);
    await vencerElPlazo(id);
    // Entrar bien reiniciaria la escalada, asi que se sigue fallando.
    const segundo = await agotarIntentos(usuario);

    expect(segundo.status).toBe(423);
    expect(segundo.body.error).toContain('5 minuto');
  });

  it('el tercero ya no caduca: solo lo levanta el administrador', async () => {
    const admin = await obtenerToken();
    const { usuario, id } = await cuentaNueva(admin);

    await agotarIntentos(usuario);
    await vencerElPlazo(id);
    await agotarIntentos(usuario);
    await vencerElPlazo(id);
    const tercero = await agotarIntentos(usuario);

    expect(tercero.status).toBe(423);
    expect(tercero.body.error).toContain('administrador');

    // Ni siquiera con el plazo cumplido: este bloqueo no caduca.
    await vencerElPlazo(id);
    const insiste = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: usuario, contrasena: 'Correcta123!' });
    expect(insiste.status).toBe(423);

    await request(app)
      .post(`/api/usuarios/${id}/desbloquear`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);

    const reabierta = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: usuario, contrasena: 'Correcta123!' });
    expect(reabierta.status).toBe(200);
  });

  /** Quien acierta demuestra ser el dueno: no arrastra sus despistes. */
  it('entrar bien reinicia la escalada', async () => {
    const admin = await obtenerToken();
    const { usuario, id } = await cuentaNueva(admin);

    await agotarIntentos(usuario);
    await vencerElPlazo(id);
    await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: usuario, contrasena: 'Correcta123!' })
      .expect(200);

    // El siguiente bloqueo vuelve a ser el primero: un minuto, no cinco.
    const otra = await agotarIntentos(usuario);
    expect(otra.body.error).toContain('1 minuto');
  });

  /** El administrador responde por la cuenta: la escalada arranca de cero. */
  it('el desbloqueo del administrador tambien la reinicia', async () => {
    const admin = await obtenerToken();
    const { usuario, id } = await cuentaNueva(admin);

    await agotarIntentos(usuario);
    await vencerElPlazo(id);
    await agotarIntentos(usuario);

    await request(app)
      .post(`/api/usuarios/${id}/desbloquear`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);

    const otra = await agotarIntentos(usuario);
    expect(otra.body.error).toContain('1 minuto');
  });
});

/**
 * CU-SEG-05 — lo que se bloquea es **la cuenta**, no la conexion.
 *
 * El inicio de sesion tenia delante un limite por direccion IP que contaba los
 * intentos de todas las cuentas juntas. Probar tres contrasenas en tres cuentas
 * distintas dejaba fuera al navegador entero --y al de al lado, y al telefono
 * en la misma red--, incluso a quien sabia su contrasena y no se habia
 * equivocado nunca. Ademas tapaba el aviso de la cuenta bloqueada con uno sobre
 * la conexion, que no explica nada a quien necesita entender por que no entra.
 */
describe('CU-SEG-05 · Se bloquea la cuenta, no la conexion', () => {
  async function cuentaNueva(tokenAdmin: string) {
    const usuario = `aisla${sufijo()}`;
    await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        nombre: 'Prueba', apellido: 'Aislada',
        email: `${usuario}@correo.bo`,
        nombreUsuario: usuario, contrasena: 'Correcta123!',
        idRol: 2, idCargo: 2,
      })
      .expect(201);
    return usuario;
  }

  const fallar = (usuario: string) =>
    request(app).post('/api/auth/login').send({ nombreUsuario: usuario, contrasena: 'incorrecta' });

  it('bloquear varias cuentas desde la misma conexion no afecta a una tercera', async () => {
    const admin = await obtenerToken();
    const [una, otra, tercera] = await Promise.all([
      cuentaNueva(admin),
      cuentaNueva(admin),
      cuentaNueva(admin),
    ]);

    // Se agotan los intentos de dos cuentas: seis fallos desde esta conexion.
    for (const cuenta of [una, otra]) {
      for (let i = 0; i < 3; i++) await fallar(cuenta);
      const bloqueada = await fallar(cuenta);
      expect(bloqueada.status).toBe(423);
    }

    // La tercera sigue con sus tres intentos intactos: su contador es suyo.
    const r = await fallar(tercera);
    expect(r.status).toBe(401);
    expect(r.body.error).toContain('2 intento');

    // Y quien sabe su contrasena entra sin problema desde la misma conexion.
    const entra = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: 'admin', contrasena: 'Admin1234!' });
    expect(entra.status).toBe(200);
  });

  /** Ningun mensaje debe hablar de la conexion: no es lo que se bloquea. */
  it('el aviso habla de la cuenta, no del dispositivo', async () => {
    const admin = await obtenerToken();
    const usuario = await cuentaNueva(admin);

    // El tercero bloquea; el cuarto ya encuentra la cuenta bloqueada. Los dos
    // mensajes tienen que hablar de la cuenta y decir cuanto falta.
    await fallar(usuario);
    await fallar(usuario);
    const bloquea = await fallar(usuario);
    const insiste = await fallar(usuario);

    for (const r of [bloquea, insiste]) {
      expect(r.status).toBe(423);
      expect(r.body.error.toLowerCase()).toContain('cuenta');
      expect(r.body.error).toContain('1 minuto');
      expect(r.body.error).not.toContain('conexión');
      expect(r.body.error).not.toContain('dispositivo');
    }
  });
});

/**
 * CU-SEG-05 — quien puede reabrir cuentas no puede quedar fuera para siempre.
 *
 * Si la unica cuenta capaz de desbloquear queda cerrada de forma definitiva, no
 * queda nadie que pueda reabrirla: bastaban nueve intentos fallidos contra el
 * administrador para dejar el sistema sin salida. Su bloqueo deja de escalar en
 * el ultimo plazo que caduca --cinco minutos--, que sigue frenando a quien
 * insiste pero nunca se vuelve irreversible.
 *
 * Se mira el permiso y no el nombre del rol: lo que crea el punto muerto es
 * *poder desbloquear*, no llamarse «Administrador».
 */
describe('CU-SEG-05 · El administrador nunca queda bloqueado para siempre', () => {
  const fallar = (usuario: string) =>
    request(app).post('/api/auth/login').send({ nombreUsuario: usuario, contrasena: 'incorrecta' });

  const vencerElPlazo = (nombreUsuario: string) =>
    prisma.usuario.update({
      where: { nombre_usuario: nombreUsuario },
      data: { fecha_bloqueo: new Date(Date.now() - 60 * 60_000) },
    });

  /**
   * Dos bloqueos cumplidos y un tercero en pie: a un empleado eso lo deja
   * fuera de forma definitiva. Devuelve la respuesta del que bloquea.
   */
  async function agotarLaEscalada(usuario: string) {
    for (let tanda = 0; tanda < 2; tanda++) {
      for (let i = 0; i < 3; i++) await fallar(usuario);
      await vencerElPlazo(usuario);
    }
    let ultima;
    for (let i = 0; i < 3; i++) ultima = await fallar(usuario);
    return ultima!;
  }

  /**
   * `admin` es la cuenta con la que se autentican casi todas las pruebas, asi
   * que se la devuelve a su estado normal aunque esta falle a mitad de camino.
   */
  afterEach(() =>
    prisma.usuario.updateMany({
      where: { nombre_usuario: 'admin' },
      data: { bloqueado: false, fecha_bloqueo: null, intentos_fallidos: 0, veces_bloqueado: 0 },
    }),
  );

  it('al agotar la escalada se queda en cinco minutos, no en definitivo', async () => {
    const r = await agotarLaEscalada('admin');

    expect(r.status).toBe(423);
    expect(r.body.error).toContain('5 minuto');
    expect(r.body.error).not.toContain('indefinidamente');

    // Y cumplido ese plazo vuelve a entrar sin que nadie lo reabra.
    await vencerElPlazo('admin');
    const entra = await request(app)
      .post('/api/auth/login')
      .send({ nombreUsuario: 'admin', contrasena: 'Admin1234!' });
    expect(entra.status).toBe(200);
  });

  /** La excepcion es solo para quien puede reabrir: al resto si lo alcanza. */
  it('a un empleado sin ese permiso si lo deja fuera', async () => {
    const admin = await obtenerToken();
    const usuario = `sinpermiso${sufijo()}`;
    await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        nombre: 'Prueba', apellido: 'SinPermiso',
        email: `${usuario}@correo.bo`,
        nombreUsuario: usuario, contrasena: 'Correcta123!',
        idRol: 2, idCargo: 2,
      })
      .expect(201);

    const r = await agotarLaEscalada(usuario);

    expect(r.status).toBe(423);
    expect(r.body.error).toContain('indefinidamente');
  });
});
