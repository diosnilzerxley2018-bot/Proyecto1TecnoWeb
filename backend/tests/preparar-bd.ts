import { config } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

config({ path: '.env.test', override: true, quiet: true });

/**
 * Recrea la base de datos de pruebas desde cero con el script del informe
 * (sección 4.5.3). Se ejecuta una vez antes de la suite: cada corrida parte
 * de un estado conocido.
 */

const URL_PRUEBAS = process.env.DATABASE_URL!;
const NOMBRE_BD = new URL(URL_PRUEBAS).pathname.slice(1);
const URL_ADMIN = URL_PRUEBAS.replace(`/${NOMBRE_BD}`, '/postgres');

async function recrearBaseDeDatos(): Promise<void> {
  const admin = new Client({ connectionString: URL_ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${NOMBRE_BD} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${NOMBRE_BD}`);
  await admin.end();
  console.log(`  base ${NOMBRE_BD} recreada`);
}

async function cargarEsquema(): Promise<void> {
  const cliente = new Client({ connectionString: URL_PRUEBAS });
  await cliente.connect();
  await cliente.query(readFileSync('prisma/schema.sql', 'utf8'));
  const { rows } = await cliente.query(
    `SELECT count(*)::int AS total FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  await cliente.end();
  console.log(`  esquema cargado: ${rows[0].total} tablas`);
}

function cargarDatosIniciales(): void {
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: URL_PRUEBAS },
  });
}

async function main() {
  console.log('Preparando base de datos de pruebas...');
  await recrearBaseDeDatos();
  await cargarEsquema();
  cargarDatosIniciales();
  console.log('Lista.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
