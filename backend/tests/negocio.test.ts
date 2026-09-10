import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { crearEmpleado, obtenerToken, registrarCliente } from './ayudantes.js';
import { invalidarCache } from '../src/services/negocio.service.js';

/**
 * RF-PED-03 — *"El sistema debe permitir buscar productos e información del
 * negocio desde el encabezado de la página principal."*
 *
 * Son dos cosas y las dos se prueban aquí: que la información esté publicada y
 * que el buscador encuentre productos e información en la misma lista.
 */

const cabecera = (token: string) => ({ Authorization: `Bearer ${token}` });

// El servicio guarda la información en caché un minuto; entre pruebas hay que
// vaciarla o la siguiente leería lo que dejó la anterior.
beforeEach(() => invalidarCache());

describe('Información del negocio', () => {
  /**
   * Pública a propósito: un visitante tiene que poder ver el horario y la
   * dirección antes de crearse una cuenta. Exigir sesión para eso convertiría
   * la página principal en un formulario de registro.
   */
  it('se consulta sin haber iniciado sesión', async () => {
    const r = await request(app).get('/api/negocio');

    expect(r.status).toBe(200);
    expect(r.body.nombre).toBeTruthy();
    expect(r.body.horario).toBeTruthy();
    expect(r.body.direccion).toBeTruthy();
  });

  /** Sin filas en `configuracion`, la página tiene que verse igual de completa. */
  it('responde con los valores por omisión antes de que nadie la edite', async () => {
    const r = await request(app).get('/api/negocio');

    expect(r.body.nombre).toBe('NutriExpress');
    expect(r.body.actualizadoEn).toBeNull();
    expect(r.body.ubicacion.latitud).toBeCloseTo(-17.78, 1);
    expect(r.body.ubicacion.longitud).toBeCloseTo(-63.18, 1);
  });

  it('el administrador la edita y el cambio queda publicado', async () => {
    const admin = await obtenerToken();

    const guardado = await request(app)
      .put('/api/negocio')
      .set(cabecera(admin))
      .send({ horario: 'Lunes a viernes de 09:00 a 18:00', telefono: '+591 3 123456' });

    expect(guardado.status).toBe(200);
    expect(guardado.body.horario).toBe('Lunes a viernes de 09:00 a 18:00');
    expect(guardado.body.actualizadoEn).not.toBeNull();

    invalidarCache();
    const publico = await request(app).get('/api/negocio');
    expect(publico.body.horario).toBe('Lunes a viernes de 09:00 a 18:00');
    expect(publico.body.telefono).toBe('+591 3 123456');
  });

  /** Se guarda solo lo que llega: editar el teléfono no debe borrar el horario. */
  it('deja intactos los campos que no se enviaron', async () => {
    const admin = await obtenerToken();

    await request(app)
      .put('/api/negocio')
      .set(cabecera(admin))
      .send({ horario: 'Todos los días de 07:00 a 22:00' })
      .expect(200);

    const r = await request(app)
      .put('/api/negocio')
      .set(cabecera(admin))
      .send({ correo: 'hola@nutriexpress.bo' });

    expect(r.body.correo).toBe('hola@nutriexpress.bo');
    expect(r.body.horario).toBe('Todos los días de 07:00 a 22:00');
  });

  /** Media coordenada no ubica nada. */
  it('rechaza una latitud sin su longitud', async () => {
    const admin = await obtenerToken();

    const r = await request(app)
      .put('/api/negocio')
      .set(cabecera(admin))
      .send({ latitud: -17.8 });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('juntas');
  });

  it('acepta las dos coordenadas juntas', async () => {
    const admin = await obtenerToken();

    const r = await request(app)
      .put('/api/negocio')
      .set(cabecera(admin))
      .send({ latitud: -17.8, longitud: -63.2 });

    expect(r.status).toBe(200);
    expect(r.body.ubicacion).toEqual({ latitud: -17.8, longitud: -63.2 });
  });

  it('no acepta un texto vacío en lugar del dato', async () => {
    const admin = await obtenerToken();

    const r = await request(app)
      .put('/api/negocio')
      .set(cabecera(admin))
      .send({ nombre: '   ' });

    expect(r.status).toBe(400);
  });

  describe('Quién puede editarla', () => {
    it('un cliente no puede', async () => {
      const cliente = await registrarCliente();
      const r = await request(app)
        .put('/api/negocio')
        .set(cabecera(cliente.token))
        .send({ nombre: 'Mi negocio' });

      expect(r.status).toBe(403);
    });

    /** Un empleado sin `CONFIGURACION_GESTIONAR` tampoco. */
    it('un vendedor no puede', async () => {
      const vendedor = await crearEmpleado('Vendedor');
      const r = await request(app)
        .put('/api/negocio')
        .set(cabecera(vendedor.token))
        .send({ nombre: 'Mi negocio' });

      expect(r.status).toBe(403);
    });

    it('sin sesión tampoco', async () => {
      const r = await request(app).put('/api/negocio').send({ nombre: 'Mi negocio' });
      expect(r.status).toBe(401);
    });
  });
});

describe('Buscador del encabezado', () => {
  it('encuentra productos', async () => {
    const r = await request(app).get('/api/negocio/buscar').query({ termino: 'avena' });

    expect(r.status).toBe(200);
    const productos = r.body.resultados.filter(
      (x: { tipo: string }) => x.tipo === 'producto',
    );
    expect(productos.length).toBeGreaterThan(0);
    expect(productos[0].idProducto).toBeGreaterThan(0);
  });

  /**
   * La mitad del requisito que no es el catálogo: el mismo campo tiene que
   * responder "¿a qué hora abren?" sin obligar a irse a otra pantalla.
   */
  it('encuentra información del negocio por el nombre del campo', async () => {
    const r = await request(app).get('/api/negocio/buscar').query({ termino: 'horario' });

    const informacion = r.body.resultados.filter(
      (x: { tipo: string }) => x.tipo === 'informacion',
    );
    expect(informacion.length).toBeGreaterThan(0);
    expect(informacion[0].detalle).toBeTruthy();
    expect(informacion[0].idProducto).toBeNull();
  });

  it('encuentra información por lo que dice, no solo por su etiqueta', async () => {
    const admin = await obtenerToken();
    await request(app)
      .put('/api/negocio')
      .set(cabecera(admin))
      .send({ horario: 'Lunes a sábado, cerrado los domingos' })
      .expect(200);

    invalidarCache();
    const r = await request(app).get('/api/negocio/buscar').query({ termino: 'domingo' });

    expect(
      r.body.resultados.some((x: { tipo: string }) => x.tipo === 'informacion'),
    ).toBe(true);
  });

  /** El sistema está escrito en español: buscar sin tildes tiene que funcionar. */
  it('ignora las tildes al comparar', async () => {
    const r = await request(app).get('/api/negocio/buscar').query({ termino: 'telefono' });

    expect(
      r.body.resultados.some((x: { titulo: string }) => x.titulo === 'Teléfono'),
    ).toBe(true);
  });

  it('devuelve productos e información en una sola lista', async () => {
    const admin = await obtenerToken();
    await request(app)
      .put('/api/negocio')
      .set(cabecera(admin))
      .send({ descripcion: 'Barras, jugos y ensaladas de avena y quinua bien frescas' })
      .expect(200);

    invalidarCache();
    const r = await request(app).get('/api/negocio/buscar').query({ termino: 'avena' });

    const tipos = new Set(r.body.resultados.map((x: { tipo: string }) => x.tipo));
    expect(tipos.has('producto')).toBe(true);
    expect(tipos.has('informacion')).toBe(true);
  });

  it('no exige sesión', async () => {
    const r = await request(app).get('/api/negocio/buscar').query({ termino: 'jugo' });
    expect(r.status).toBe(200);
  });

  it('con el término vacío no devuelve nada, en vez de devolverlo todo', async () => {
    const r = await request(app).get('/api/negocio/buscar').query({ termino: '' });

    expect(r.status).toBe(200);
    expect(r.body.resultados).toEqual([]);
  });

  it('sin coincidencias devuelve la lista vacía', async () => {
    const r = await request(app)
      .get('/api/negocio/buscar')
      .query({ termino: 'xyzabcnoexiste' });

    expect(r.body.resultados).toEqual([]);
  });
});
