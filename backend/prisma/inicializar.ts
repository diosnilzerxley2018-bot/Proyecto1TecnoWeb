import { readFileSync } from 'node:fs';
import { Client } from 'pg';

/**
 * Prepara una base de datos **vacía** para que el sistema pueda arrancar.
 *
 * Existe porque el esquema es un script SQL y no un juego de migraciones
 * versionadas (hallazgo A5, RNF-MAN-03 pendiente): en la máquina de desarrollo
 * se carga con `psql -f prisma/schema.sql`, pero en un servidor gestionado no
 * hay una terminal donde hacerlo.
 *
 * **Nunca destruye nada.** A diferencia de `tests/preparar-bd.ts` —que borra y
 * recrea la base en cada corrida, y puede hacerlo porque es la base de
 * pruebas—, este script comprueba primero si ya hay tablas y, si las hay, no
 * toca nada. Ejecutarlo dos veces por error no debe costar los datos del
 * negocio.
 *
 * Uso:  DATABASE_URL="..." npx tsx prisma/inicializar.ts
 */

const url = process.env.DATABASE_URL;

if (!url) {
  console.error('Falta DATABASE_URL. Sin ella no hay base que preparar.');
  process.exit(1);
}

async function contarTablas(cliente: Client): Promise<number> {
  const { rows } = await cliente.query<{ total: number }>(
    `SELECT count(*)::int AS total
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  return rows[0].total;
}

async function main(): Promise<void> {
  const cliente = new Client({
    connectionString: url,
    // Los proveedores gestionados exigen TLS, y el certificado lo firma su
    // propia autoridad. Verificarlo obligaría a distribuir ese certificado;
    // la conexión va cifrada igual.
    ssl: url!.includes('localhost') ? undefined : { rejectUnauthorized: false },
  });

  await cliente.connect();
  console.log('Conectado a la base de datos.');

  const existentes = await contarTablas(cliente);

  if (existentes > 0) {
    console.log(`Ya hay ${existentes} tabla(s): no se toca nada.`);
    console.log('Para volver a empezar hay que vaciar la base a mano, a propósito.');
    await cliente.end();
    return;
  }

  console.log('La base está vacía. Cargando el esquema...');
  // La ruta es relativa a la raíz del backend, que es desde donde se ejecuta.
  await cliente.query(readFileSync('prisma/schema.sql', 'utf8'));

  const creadas = await contarTablas(cliente);
  console.log(`Esquema cargado: ${creadas} tablas.`);

  await cliente.end();

  // La siembra va aparte y después, porque necesita el cliente de Prisma —que
  // exige que las tablas ya existan— y porque separar «crear» de «poblar»
  // permite repetir solo lo segundo si hiciera falta.
  console.log('Sembrando los datos iniciales...');
  const { main: sembrar } = await import('./seed.js');
  await sembrar();
}

main().catch((error: unknown) => {
  console.error('No se pudo preparar la base de datos:');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
