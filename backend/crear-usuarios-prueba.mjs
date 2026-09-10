// Crea un juego de usuarios de prueba, uno por cada tipo de cuenta, para
// practicar la gestión de usuarios sin tocar al administrador.
//
// Es idempotente: si un usuario ya existe, le reescribe la contraseña y sus
// asignaciones en vez de duplicarlo. Correrlo dos veces deja el mismo estado.
//
//   node crear-usuarios-prueba.mjs
//
// Se puede borrar este archivo cuando ya no haga falta; no forma parte del
// sistema, es una herramienta de apoyo para el estudio.

import 'dotenv/config';
import bcrypt from 'bcrypt';
import pg from 'pg';

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });

/**
 * Usuarios a crear. Las contraseñas cumplen RF-SEG-03 (ocho caracteres,
 * mayúscula, minúscula, número y carácter especial) y son fáciles de recordar.
 * No se incluye ningún administrador a propósito.
 */
const USUARIOS = [
  { usuario: 'vendedor',   nombre: 'Valeria',  apellido: 'Ventas',    rol: 'Empleado', cargo: 'Vendedor',    clave: 'Vendedor2026!' },
  { usuario: 'cocinero',   nombre: 'Carlos',   apellido: 'Cocina',    rol: 'Empleado', cargo: 'Cocinero',    clave: 'Cocinero2026!' },
  { usuario: 'almacenero', nombre: 'Ana',      apellido: 'Almacén',   rol: 'Empleado', cargo: 'Almacenero',  clave: 'Almacen2026!' },
  { usuario: 'cliente',    nombre: 'Camila',   apellido: 'Cliente',   rol: 'Cliente',  cargo: null,          clave: 'Cliente2026!' },
];

async function idDe(tabla, columnaId, columnaNombre, valor) {
  const r = await cliente.query(
    `select ${columnaId} as id from ${tabla} where ${columnaNombre} = $1`,
    [valor],
  );
  if (r.rowCount === 0) throw new Error(`No existe ${tabla}.${columnaNombre} = ${valor}`);
  return r.rows[0].id;
}

async function crear(datos) {
  const idRol = await idDe('rol', 'id_rol', 'nombre', datos.rol);
  const hash = await bcrypt.hash(datos.clave, 10);

  // Alta o actualización del usuario. Se reescribe la contraseña siempre, para
  // que correrlo de nuevo sirva también como "restablecer".
  const usuario = await cliente.query(
    `insert into usuario (nombre, apellido, email, nombre_usuario, contrasena_hash, id_rol)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (nombre_usuario) do update
       set contrasena_hash = excluded.contrasena_hash,
           id_rol = excluded.id_rol,
           activo = true,
           bloqueado = false,
           intentos_fallidos = 0
     returning id_usuario`,
    [datos.nombre, datos.apellido, `${datos.usuario}@nutriexpress.bo`, datos.usuario, hash, idRol],
  );
  const idUsuario = usuario.rows[0].id_usuario;

  // Subtipo: empleado (con su cargo) o cliente. Las claves foráneas del
  // sistema apuntan a una u otra tabla, así que sin esto el usuario no podría
  // registrar ventas ni hacer pedidos.
  if (datos.rol === 'Empleado') {
    const idCargo = await idDe('cargo', 'id_cargo', 'nombre', datos.cargo);
    await cliente.query(
      `insert into empleado (id_empleado, id_cargo) values ($1, $2)
       on conflict (id_empleado) do update set id_cargo = excluded.id_cargo`,
      [idUsuario, idCargo],
    );
  } else {
    await cliente.query(
      `insert into cliente (id_cliente) values ($1) on conflict (id_cliente) do nothing`,
      [idUsuario],
    );
  }

  // Copia de los permisos del rol al usuario. El sistema comprueba
  // usuario_rol_permiso, no el rol directamente, de modo que sin estas filas
  // el usuario entraría pero no podría hacer nada.
  await cliente.query(
    `insert into usuario_rol_permiso (id_usuario, id_rol_permiso)
     select $1, rp.id_rol_permiso from rol_permiso rp where rp.id_rol = $2
     on conflict (id_usuario, id_rol_permiso) do nothing`,
    [idUsuario, idRol],
  );

  return { usuario: datos.usuario, clave: datos.clave, rol: datos.rol, cargo: datos.cargo ?? '-' };
}

async function main() {
  await cliente.connect();
  console.log('Creando usuarios de prueba...\n');

  const creados = [];
  for (const datos of USUARIOS) {
    creados.push(await crear(datos));
  }

  console.table(creados);
  console.log('\nListo. El administrador (admin / Admin1234!) no fue modificado.');
  await cliente.end();
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
