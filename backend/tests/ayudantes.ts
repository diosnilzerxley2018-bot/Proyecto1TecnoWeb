import request from 'supertest';
import { app } from '../src/app.js';

/** Inicia sesión y devuelve el token, para reutilizarlo en las pruebas. */
export async function obtenerToken(
  nombreUsuario = 'admin',
  contrasena = 'Admin1234!',
): Promise<string> {
  const respuesta = await request(app)
    .post('/api/auth/login')
    .send({ nombreUsuario, contrasena });
  if (respuesta.status !== 200) {
    throw new Error(`No se pudo autenticar a ${nombreUsuario}: ${JSON.stringify(respuesta.body)}`);
  }
  return respuesta.body.token as string;
}

/** Sufijo único para que cada prueba cree datos que no choquen con otras. */
export const sufijo = () => Math.random().toString(36).slice(2, 8);

/** Registra un cliente nuevo (CU-VEN-02) y devuelve su token e identificador. */
export async function registrarCliente(): Promise<{ token: string; nombreUsuario: string }> {
  const nombreUsuario = `cliente${sufijo()}`;
  const contrasena = 'Cliente1234!';

  const alta = await request(app).post('/api/auth/registro').send({
    nombre: 'Cliente',
    apellido: 'De Prueba',
    email: `${nombreUsuario}@correo.bo`,
    nombreUsuario,
    contrasena,
  });
  if (alta.status >= 400) {
    throw new Error(`No se pudo registrar el cliente: ${JSON.stringify(alta.body)}`);
  }

  return { token: await obtenerToken(nombreUsuario, contrasena), nombreUsuario };
}

/** Devuelve un producto del catálogo público por su nombre. */
export async function buscarProducto(termino: string) {
  const r = await request(app).get('/api/catalogo').query({ termino });
  if (r.status !== 200 || r.body.length === 0) {
    throw new Error(`No se encontró el producto "${termino}"`);
  }
  return r.body[0] as { id: number; precio: number; stockDisponible: number; nombre: string };
}

/** Crea un empleado con el cargo indicado (CU-SEG-02) y devuelve su id y token. */
export async function crearEmpleado(
  nombreCargo: string,
): Promise<{ id: number; token: string; nombreUsuario: string }> {
  const tokenAdmin = await obtenerToken();
  const cabecera = { Authorization: `Bearer ${tokenAdmin}` };

  const [roles, cargos] = await Promise.all([
    request(app).get('/api/roles').set(cabecera),
    request(app).get('/api/cargos').set(cabecera),
  ]);

  const rol = roles.body.find((r: { nombre: string }) => r.nombre === 'Empleado');
  const cargo = cargos.body.find((c: { nombre: string }) => c.nombre === nombreCargo);
  if (!rol || !cargo) throw new Error(`No existe el rol Empleado o el cargo ${nombreCargo}`);

  const nombreUsuario = `emp${sufijo()}`;
  const contrasena = 'Empleado1234!';

  const creado = await request(app)
    .post('/api/usuarios')
    .set(cabecera)
    .send({
      nombre: 'Empleado',
      apellido: nombreCargo,
      email: `${nombreUsuario}@nutriexpress.bo`,
      nombreUsuario,
      contrasena,
      idRol: rol.id,
      idCargo: cargo.id,
    });
  if (creado.status !== 201) {
    throw new Error(`No se pudo crear el empleado: ${JSON.stringify(creado.body)}`);
  }

  return {
    id: creado.body.id,
    token: await obtenerToken(nombreUsuario, contrasena),
    nombreUsuario,
  };
}

/** Confirma un pedido de prueba y devuelve su identificador. */
export async function crearPedido(tokenCliente: string, nombreProducto: string): Promise<number> {
  const producto = await buscarProducto(nombreProducto);
  const r = await request(app)
    .post('/api/pedidos')
    .set('Authorization', `Bearer ${tokenCliente}`)
    .send({
      metodoPago: 'Efectivo',
      ubicacion: {
        calle: 'Avenida Banzer',
        numero: '1200',
        referencia: 'Frente al parque, puerta verde',
      },
      items: [{ idProducto: producto.id, cantidad: 1 }],
    });
  if (r.status !== 201) throw new Error(`No se pudo crear el pedido: ${JSON.stringify(r.body)}`);
  return r.body.id as number;
}
