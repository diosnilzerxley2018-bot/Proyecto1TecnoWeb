import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { crearEmpleado, registrarCliente } from './ayudantes.js';
import { MensajeroSimulado, reiniciarMensajero } from '../src/correo/index.js';

/**
 * «Olvidé mi contraseña»: un código de seis dígitos al correo de la cuenta.
 *
 * Es la salida para quien olvidó la contraseña o quedó bloqueado —también el
 * administrador, que no tiene a nadie por encima que lo desbloquee—.
 */

const NUEVA = 'Recuperada2026!';

const pedirCodigo = (identificador: string) =>
  request(app).post('/api/auth/recuperar').send({ identificador });

/** El código del último correo que le llegó a esa dirección. */
async function codigoPara(correo: string): Promise<string> {
  await vi.waitFor(() =>
    expect(
      MensajeroSimulado.enviados.some((m) => m.para.includes(correo) && m.asunto.includes('código')),
    ).toBe(true),
  );
  const correoConCodigo = MensajeroSimulado.enviados.find(
    (m) => m.para.includes(correo) && m.asunto.includes('código'),
  )!;
  return /(\d{6}) es su código/.exec(correoConCodigo.asunto)![1];
}

async function clienteConCodigo() {
  const cliente = await registrarCliente();
  const correo = `${cliente.nombreUsuario}@correo.bo`;
  await pedirCodigo(cliente.nombreUsuario).expect(200);
  return { ...cliente, correo, codigo: await codigoPara(correo) };
}

const entrar = (nombreUsuario: string, contrasena: string) =>
  request(app).post('/api/auth/login').send({ nombreUsuario, contrasena });

beforeEach(() => reiniciarMensajero());

describe('Recuperar la contraseña · pedir el código', () => {
  it('manda un código de seis dígitos al correo de la cuenta', async () => {
    const { correo, codigo } = await clienteConCodigo();

    expect(codigo).toMatch(/^\d{6}$/);
    const mensaje = MensajeroSimulado.enviados.find((m) => m.para.includes(correo))!;
    expect(mensaje.texto).toContain('Vence en 15 minutos');
    // Si responde, le contesta el soporte configurado del negocio.
    const negocio = await request(app).get('/api/negocio');
    expect(mensaje.responderA).toBe(negocio.body.correo);
  });

  it('también se pide con el correo, sin importar mayúsculas', async () => {
    const cliente = await registrarCliente();
    const correo = `${cliente.nombreUsuario}@correo.bo`;

    await pedirCodigo(correo.toUpperCase()).expect(200);

    expect(await codigoPara(correo)).toMatch(/^\d{6}$/);
  });

  it('responde lo mismo si la cuenta no existe, y no manda nada', async () => {
    const existe = await registrarCliente();
    const conCuenta = await pedirCodigo(existe.nombreUsuario);
    const sinCuenta = await pedirCodigo('nadie-se-llama-asi');

    expect(sinCuenta.status).toBe(200);
    expect(sinCuenta.body).toEqual(conCuenta.body);
    // Se espera el correo de la cuenta que existe; después no llega ningún otro.
    await codigoPara(`${existe.nombreUsuario}@correo.bo`);
    await new Promise((r) => setTimeout(r, 200));
    expect(MensajeroSimulado.enviados).toHaveLength(1);
  });

  it('no manda otro código antes de un minuto', async () => {
    const { correo } = await clienteConCodigo();
    reiniciarMensajero();

    await pedirCodigo(correo).expect(200);
    await new Promise((r) => setTimeout(r, 100));

    expect(MensajeroSimulado.enviados).toHaveLength(0);
  });

  it('a una cuenta dada de baja no le manda nada', async () => {
    const empleado = await crearEmpleado('Vendedor');
    await prisma.usuario.update({ where: { id_usuario: empleado.id }, data: { activo: false } });

    await pedirCodigo(empleado.nombreUsuario).expect(200);
    await new Promise((r) => setTimeout(r, 100));

    expect(MensajeroSimulado.enviados).toHaveLength(0);
  });
});

describe('Recuperar la contraseña · el código', () => {
  it('se confirma antes de pedir la contraseña nueva, sin gastarse', async () => {
    const { nombreUsuario, codigo } = await clienteConCodigo();

    await request(app)
      .post('/api/auth/recuperar/verificar')
      .send({ identificador: nombreUsuario, codigo })
      .expect(200, { valido: true });
    // Sigue sirviendo para cambiar la contraseña.
    await request(app)
      .post('/api/auth/recuperar/restablecer')
      .send({ identificador: nombreUsuario, codigo, contrasena: NUEVA })
      .expect(200);
  });

  it('un código equivocado dice cuántos intentos quedan, y al quinto ya no sirve', async () => {
    const { nombreUsuario, codigo } = await clienteConCodigo();
    const otro = codigo === '000000' ? '111111' : '000000';

    const primero = await request(app)
      .post('/api/auth/recuperar/verificar')
      .send({ identificador: nombreUsuario, codigo: otro });
    expect(primero.status).toBe(400);
    expect(primero.body.error).toContain('Le quedan 4 intento(s)');

    for (let i = 0; i < 4; i++) {
      await request(app)
        .post('/api/auth/recuperar/verificar')
        .send({ identificador: nombreUsuario, codigo: otro });
    }

    // Ahora ni el correcto: hay que pedir uno nuevo.
    const correcto = await request(app)
      .post('/api/auth/recuperar/verificar')
      .send({ identificador: nombreUsuario, codigo });
    expect(correcto.status).toBe(400);
    expect(correcto.body.error).toContain('Pida uno nuevo');
  });

  it('vence a los quince minutos', async () => {
    const { nombreUsuario, codigo } = await clienteConCodigo();
    const cuenta = await prisma.usuario.findUniqueOrThrow({ where: { nombre_usuario: nombreUsuario } });
    await prisma.recuperacion_contrasena.updateMany({
      where: { id_usuario: cuenta.id_usuario },
      data: { creado_en: new Date(Date.now() - 20 * 60_000), expira_en: new Date(Date.now() - 60_000) },
    });

    const r = await request(app)
      .post('/api/auth/recuperar/verificar')
      .send({ identificador: nombreUsuario, codigo });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('ya venció');
  });

  it('en la base queda su huella, nunca el código', async () => {
    const { nombreUsuario, codigo } = await clienteConCodigo();
    const cuenta = await prisma.usuario.findUniqueOrThrow({ where: { nombre_usuario: nombreUsuario } });
    const fila = await prisma.recuperacion_contrasena.findFirstOrThrow({
      where: { id_usuario: cuenta.id_usuario },
    });

    expect(fila.codigo_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(fila.codigo_hash).not.toContain(codigo);
  });
});

describe('Recuperar la contraseña · la contraseña nueva', () => {
  it('reemplaza a la anterior, sirve una sola vez y avisa del cambio', async () => {
    const { nombreUsuario, correo, codigo } = await clienteConCodigo();

    const r = await request(app)
      .post('/api/auth/recuperar/restablecer')
      .send({ identificador: nombreUsuario, codigo, contrasena: NUEVA });
    expect(r.status).toBe(200);

    await entrar(nombreUsuario, NUEVA).expect(200);
    await entrar(nombreUsuario, 'Cliente1234!').expect(401);

    // El mismo código no sirve dos veces.
    await request(app)
      .post('/api/auth/recuperar/restablecer')
      .send({ identificador: nombreUsuario, codigo, contrasena: 'OtraMas2026!' })
      .expect(400);

    await vi.waitFor(() =>
      expect(
        MensajeroSimulado.enviados.some(
          (m) => m.para.includes(correo) && m.asunto === 'Su contraseña fue cambiada',
        ),
      ).toBe(true),
    );
  });

  it('exige la misma política que el alta', async () => {
    const { nombreUsuario, codigo } = await clienteConCodigo();

    const r = await request(app)
      .post('/api/auth/recuperar/restablecer')
      .send({ identificador: nombreUsuario, codigo, contrasena: 'solominus' });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('mayúscula');
  });

  it('desbloquea la cuenta: el bloqueado recupera su acceso', async () => {
    const cliente = await registrarCliente();
    for (let i = 0; i < 3; i++) await entrar(cliente.nombreUsuario, 'Incorrecta1!');
    await entrar(cliente.nombreUsuario, 'Cliente1234!').expect(423);

    await pedirCodigo(cliente.nombreUsuario).expect(200);
    const codigo = await codigoPara(`${cliente.nombreUsuario}@correo.bo`);
    await request(app)
      .post('/api/auth/recuperar/restablecer')
      .send({ identificador: cliente.nombreUsuario, codigo, contrasena: NUEVA })
      .expect(200);

    await entrar(cliente.nombreUsuario, NUEVA).expect(200);
  });
});
