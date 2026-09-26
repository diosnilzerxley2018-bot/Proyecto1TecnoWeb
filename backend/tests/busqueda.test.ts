import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  crearEmpleado,
  crearPedido,
  obtenerToken,
  registrarCliente,
  sufijo,
} from './ayudantes.js';

/**
 * Búsqueda por texto en los listados.
 *
 * La resuelve el servidor: los listados vienen por páginas, y buscar solo en
 * la página visible dejaría fuera a quien está en la siguiente. Todas las
 * búsquedas comparten el criterio de `models/busqueda-texto.ts`: sin tildes
 * ni mayúsculas, y cada palabra por separado.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

const listar = async (consulta: Record<string, string | number>) => {
  const admin = await obtenerToken();
  return request(app).get('/api/usuarios').query(consulta).set(cabecera(admin));
};

describe('Usuarios · búsqueda', () => {
  it('encuentra por parte del nombre de usuario, sin importar mayúsculas', async () => {
    const cliente = await registrarCliente();

    const r = await listar({ termino: cliente.nombreUsuario.slice(-6).toUpperCase() });

    expect(r.status).toBe(200);
    expect(r.body.datos.map((u: { nombreUsuario: string }) => u.nombreUsuario)).toContain(
      cliente.nombreUsuario,
    );
  });

  it('busca en todas las páginas, no solo en la visible', async () => {
    // El recién creado es el último por identificador: nunca cae en la primera página.
    const cliente = await registrarCliente();

    const r = await listar({ termino: cliente.nombreUsuario, porPagina: 1 });

    expect(r.body.total).toBe(1);
    expect(r.body.datos[0].nombreUsuario).toBe(cliente.nombreUsuario);
  });

  it('acepta varias palabras en cualquier orden, aunque vivan en campos distintos', async () => {
    const cliente = await registrarCliente(); // apellido "De Prueba"
    const marca = cliente.nombreUsuario.replace('cliente', '');

    const r = await listar({ termino: `prueba ${marca}` });

    expect(r.body.datos.map((u: { nombreUsuario: string }) => u.nombreUsuario)).toEqual([
      cliente.nombreUsuario,
    ]);
  });

  it('no distingue tildes: «rodriguez pena» encuentra a Rodríguez Peña', async () => {
    const nombreUsuario = await registrarConNombre('José', 'Rodríguez Peña');

    const sinTildes = await listar({ termino: `rodriguez pena jose ${nombreUsuario}` });
    const conMayusculas = await listar({ termino: `JOSÉ ${nombreUsuario}` });

    expect(sinTildes.body.total).toBe(1);
    expect(sinTildes.body.datos[0].nombreCompleto).toBe('José Rodríguez Peña');
    expect(conMayusculas.body.total).toBe(1);
  });

  it('toma % y _ como caracteres, no como comodines', async () => {
    const cliente = await registrarCliente();

    // Si «%» fuera comodín, «<usuario>%» encontraría al cliente.
    const r = await listar({ termino: `${cliente.nombreUsuario}%` });

    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
  });
});

describe('Usuarios · filtros', () => {
  it('filtra por rol', async () => {
    const admin = await obtenerToken();
    const roles = await request(app).get('/api/roles').set(cabecera(admin));
    const cliente = roles.body.find((r: { nombre: string }) => r.nombre === 'Cliente');

    const r = await listar({ idRol: cliente.id, porPagina: 100 });

    expect(r.body.datos.length).toBeGreaterThan(0);
    expect(r.body.datos.every((u: { rol: string }) => u.rol === 'Cliente')).toBe(true);
  });

  it('separa las cuentas bloqueadas de las activas', async () => {
    const cliente = await registrarCliente();
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ nombreUsuario: cliente.nombreUsuario, contrasena: 'Equivocada1!' });
    }

    const bloqueados = await listar({ estado: 'bloqueados', termino: cliente.nombreUsuario });
    const activos = await listar({ estado: 'activos', termino: cliente.nombreUsuario });

    expect(bloqueados.body.total).toBe(1);
    expect(activos.body.total).toBe(0);
  });

  it('rechaza un estado que no existe', async () => {
    const r = await listar({ estado: 'dormidos' });
    expect(r.status).toBe(400);
  });

  it('el resumen cuenta todas las cuentas, no las de una página', async () => {
    const admin = await obtenerToken();
    const [resumen, todos] = await Promise.all([
      request(app).get('/api/usuarios/resumen').set(cabecera(admin)),
      listar({ porPagina: 1 }),
    ]);

    expect(resumen.status).toBe(200);
    expect(resumen.body.total).toBe(todos.body.total);
    expect(resumen.body.activos).toBeGreaterThan(0);
  });

  it('los estados no se superponen: suman el total y cada cifra es lo que trae su filtro', async () => {
    // Una cuenta bloqueada y después dada de baja: cuenta solo como baja.
    const admin = await obtenerToken();
    const cliente = await registrarCliente();
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ nombreUsuario: cliente.nombreUsuario, contrasena: 'Equivocada1!' });
    }
    const fila = await listar({ termino: cliente.nombreUsuario });
    await request(app).delete(`/api/usuarios/${fila.body.datos[0].id}`).set(cabecera(admin));

    const resumen = await request(app).get('/api/usuarios/resumen').set(cabecera(admin));
    const { total, activos, bloqueados, bajas } = resumen.body;
    expect(activos + bloqueados + bajas).toBe(total);

    for (const estado of ['activos', 'bloqueados', 'bajas'] as const) {
      const r = await listar({ estado, porPagina: 1 });
      expect(r.body.total).toBe(resumen.body[estado]);
    }
    const suBaja = await listar({ estado: 'bajas', termino: cliente.nombreUsuario });
    const suBloqueo = await listar({ estado: 'bloqueados', termino: cliente.nombreUsuario });
    expect(suBaja.body.total).toBe(1);
    expect(suBloqueo.body.total).toBe(0);
  });

  it('un cliente no puede ver el listado ni el resumen', async () => {
    const cliente = await registrarCliente();
    const r = await request(app).get('/api/usuarios/resumen').set(cabecera(cliente.token));
    expect(r.status).toBe(403);
  });
});

/** Da de alta un cliente con el nombre y apellido indicados; el correo lleva la marca. */
async function registrarConNombre(nombre: string, apellido: string) {
  const nombreUsuario = `tildes${sufijo()}`;
  const alta = await request(app).post('/api/auth/registro').send({
    nombre,
    apellido,
    email: `${nombreUsuario}@correo.bo`,
    nombreUsuario,
    contrasena: 'Cliente1234!',
  });
  expect(alta.status).toBe(201);
  return nombreUsuario;
}

describe('Clientes · búsqueda', () => {
  it('encuentra por el nombre completo, aunque nombre y apellido vivan en columnas distintas', async () => {
    const admin = await obtenerToken();
    const marca = await registrarConNombre('María', 'Gómez');

    // Antes se comparaba la frase entera contra cada columna, y ninguna
    // contiene «maria gomez»: escribir el nombre completo no encontraba a nadie.
    const r = await request(app)
      .get('/api/clientes')
      .query({ termino: `maria gomez ${marca}` })
      .set(cabecera(admin));

    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
  });
});

describe('Catálogo · búsqueda', () => {
  const nombres = (r: { body: { nombre: string }[] }) => r.body.map((p) => p.nombre);

  it('no distingue tildes, ni en lo buscado ni en lo guardado', async () => {
    // El producto se llama «Ensalada Cesar», sin tilde: quien escribe bien
    // «César» también tiene que encontrarlo.
    const r = await request(app).get('/api/catalogo').query({ termino: 'CÉSAR' });
    expect(nombres(r)).toContain('Ensalada Cesar con pollo');
  });

  it('busca cada palabra por separado, en el nombre o en la categoría', async () => {
    const [salteado, mezclado] = await Promise.all([
      // «verde» queda en el medio y no se escribe.
      request(app).get('/api/catalogo').query({ termino: 'jugo detox' }),
      // «bebidas» es de la categoría; «limonada», del nombre.
      request(app).get('/api/catalogo').query({ termino: 'bebidas limonada' }),
    ]);

    expect(nombres(salteado)).toContain('Jugo verde detox');
    expect(nombres(mezclado)).toContain('Limonada con hierbabuena');
    expect(nombres(mezclado)).not.toContain('Jugo verde detox');
  });
});

describe('Insumos · búsqueda', () => {
  it('«limón» con tilde encuentra el insumo guardado como «Limon»', async () => {
    const admin = await obtenerToken();
    const r = await request(app)
      .get('/api/insumos')
      .query({ termino: 'limón' })
      .set(cabecera(admin));

    expect(r.status).toBe(200);
    expect(r.body.map((i: { nombre: string }) => i.nombre)).toContain('Limon');
  });
});

describe('Buscador general', () => {
  type Resultado = { tipo: string; id: number; titulo: string; detalle: string; monto: number | null };

  const buscar = (token: string, q: string) =>
    request(app).get('/api/buscar').query({ q }).set(cabecera(token));
  const resultados = (r: { body: { resultados: Resultado[] } }) => r.body.resultados;

  it('encuentra de todo en una sola búsqueda, sin tildes', async () => {
    const admin = await obtenerToken();

    const r = await buscar(admin, 'limón');

    expect(r.status).toBe(200);
    const encontrados = resultados(r).map((x) => `${x.tipo}: ${x.titulo}`);
    expect(encontrados).toContain('insumo: Limon');
    expect(encontrados).toContain('producto: Limonada con hierbabuena');
  });

  it('un número busca el pedido por su identificador, con o sin #', async () => {
    const cliente = await registrarCliente();
    const id = await crearPedido(cliente.token, 'Ensalada Cesar');
    const admin = await obtenerToken();

    for (const q of [`#${id}`, String(id)]) {
      const pedido = resultados(await buscar(admin, q)).find((x) => x.tipo === 'pedido');
      expect(pedido).toMatchObject({ id, titulo: `Pedido #${id}`, detalle: 'Cliente De Prueba' });
      expect(pedido?.monto).toBeGreaterThan(0);
    }
  });

  it('encuentra los pedidos por el nombre de quien los hizo', async () => {
    const nombreUsuario = await registrarConNombre('Rocío', `Pedidos${sufijo()}`);
    const token = await obtenerToken(nombreUsuario, 'Cliente1234!');
    const id = await crearPedido(token, 'Ensalada Cesar');
    const admin = await obtenerToken();
    const apellido = (
      await request(app).get('/api/perfil').set(cabecera(token))
    ).body.apellido as string;

    const r = await buscar(admin, `rocio ${apellido}`);

    expect(resultados(r).filter((x) => x.tipo === 'pedido').map((x) => x.id)).toEqual([id]);
  });

  it('solo trae lo que el permiso deja ver: un vendedor no encuentra cuentas de usuario', async () => {
    const vendedor = await crearEmpleado('Vendedor');
    const admin = await obtenerToken();

    const comoVendedor = await buscar(vendedor.token, vendedor.nombreUsuario);
    const comoAdmin = await buscar(admin, vendedor.nombreUsuario);

    expect(comoVendedor.status).toBe(200);
    expect(resultados(comoVendedor).some((x) => x.tipo === 'usuario')).toBe(false);
    expect(resultados(comoAdmin).some((x) => x.tipo === 'usuario')).toBe(true);
  });

  it('un cliente no puede usarlo, aunque tenga PEDIDO_LEER para ver sus pedidos', async () => {
    // Sin la comprobación de subtipo, «1» le mostraría el pedido de otro.
    const cliente = await registrarCliente();
    const r = await buscar(cliente.token, '1');
    expect(r.status).toBe(403);
  });

  it('una sola letra no busca nada', async () => {
    const admin = await obtenerToken();
    const r = await buscar(admin, 'a');
    expect(r.status).toBe(200);
    expect(resultados(r)).toEqual([]);
  });

  it('pide sesión y pide qué buscar', async () => {
    const admin = await obtenerToken();
    expect((await request(app).get('/api/buscar').query({ q: 'pollo' })).status).toBe(401);
    expect((await request(app).get('/api/buscar').set(cabecera(admin))).status).toBe(400);
  });
});
