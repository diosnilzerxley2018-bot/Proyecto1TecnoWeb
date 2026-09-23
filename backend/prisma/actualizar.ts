// En Railway las variables las pone la plataforma; en la máquina de desarrollo
// vienen del `.env`, igual que en `seed.ts`.
import 'dotenv/config';
import { Client } from 'pg';

/**
 * Pone al día una base **que ya tiene datos**.
 *
 * `inicializar.ts` solo sirve para una base vacía: si encuentra tablas no toca
 * nada, y hace bien. Pero entonces un cambio de esquema posterior no tenía
 * forma de llegar a producción salvo abriendo una terminal de PostgreSQL, que
 * en un servidor gestionado no siempre existe (hallazgo A5, RNF-MAN-03).
 *
 * Esto no pretende ser un juego de migraciones versionadas. Es la lista de los
 * ajustes aplicados a `schema.sql` **después** del primer despliegue, escritos
 * de forma que correrlos de más no cueste nada.
 *
 * **Cada ajuste tiene que ser idempotente y no destructivo.** Nada de `DROP
 * COLUMN` ni de `UPDATE` masivos: este script se ejecuta contra la base del
 * negocio, a veces con la aplicación en marcha, y a veces dos veces seguidas
 * porque nadie recuerda si ya lo corrió.
 *
 * Uso:  npm run db:actualizar
 */

interface Ajuste {
  nombre: string;
  /** Sentencias en orden. Todas deben poder repetirse sin efecto. */
  sentencias: string[];
}

const AJUSTES: Ajuste[] = [
  {
    nombre: 'pago.tipo_datos — cómo se muestra el cobro lo dice la pasarela',
    sentencias: [
      `ALTER TABLE pago ADD COLUMN IF NOT EXISTS tipo_datos VARCHAR(4)`,
      // PostgreSQL no tiene `ADD CONSTRAINT IF NOT EXISTS`: se quita y se
      // vuelve a poner, que es la forma idempotente de declararla.
      `ALTER TABLE pago DROP CONSTRAINT IF EXISTS ck_pago_tipo_datos`,
      `ALTER TABLE pago ADD CONSTRAINT ck_pago_tipo_datos
         CHECK (tipo_datos IS NULL OR tipo_datos IN ('qr','url'))`,
    ],
  },
  {
    nombre: 'PEDIDO_CERRAR_AJENO — el administrador puede cerrar una entrega ajena',
    sentencias: [
      `INSERT INTO permiso (nombre) VALUES ('PEDIDO_CERRAR_AJENO')
         ON CONFLICT (nombre) DO NOTHING`,

      `INSERT INTO rol_permiso (id_rol, id_permiso)
         SELECT r.id_rol, p.id_permiso
           FROM rol r, permiso p
          WHERE r.nombre = 'Administrador' AND p.nombre = 'PEDIDO_CERRAR_AJENO'
         ON CONFLICT (id_rol, id_permiso) DO NOTHING`,

      /*
       * Y se lo habilita a los administradores que ya existen.
       *
       * Un permiso agregado a un rol no baja solo a sus usuarios --esa es la
       * regla del sistema y no se cambia aqui--, asi que sin esta sentencia la
       * llave quedaria definida y en manos de nadie: el administrador tendria
       * que habilitarsela a si mismo antes de poder usarla.
       */
      `INSERT INTO usuario_rol_permiso (id_usuario, id_rol_permiso)
         SELECT u.id_usuario, rp.id_rol_permiso
           FROM usuario u
           JOIN rol r  ON r.id_rol = u.id_rol AND r.nombre = 'Administrador'
           JOIN permiso p ON p.nombre = 'PEDIDO_CERRAR_AJENO'
           JOIN rol_permiso rp ON rp.id_rol = r.id_rol AND rp.id_permiso = p.id_permiso
         ON CONFLICT (id_usuario, id_rol_permiso) DO NOTHING`,
    ],
  },
  {
    nombre: 'usuario.veces_bloqueado — el bloqueo por intentos fallidos escala',
    sentencias: [
      `ALTER TABLE usuario ADD COLUMN IF NOT EXISTS veces_bloqueado INT NOT NULL DEFAULT 0`,
    ],
  },
];

const url = process.env.DATABASE_URL;

if (!url) {
  console.error('Falta DATABASE_URL. Sin ella no hay base que actualizar.');
  process.exit(1);
}

async function main(): Promise<void> {
  const cliente = new Client({
    connectionString: url,
    // Igual que en `inicializar.ts`: los proveedores gestionados exigen TLS con
    // certificado propio, y verificarlo obligaría a distribuirlo.
    ssl: url!.includes('localhost') ? undefined : { rejectUnauthorized: false },
  });

  await cliente.connect();
  console.log('Conectado a la base de datos.');

  for (const ajuste of AJUSTES) {
    // Cada ajuste va en su propia transacción: uno que falle no deja a los
    // anteriores a medio aplicar ni impide diagnosticar cuál fue.
    await cliente.query('BEGIN');
    try {
      for (const sentencia of ajuste.sentencias) {
        await cliente.query(sentencia);
      }
      await cliente.query('COMMIT');
      console.log(`  aplicado: ${ajuste.nombre}`);
    } catch (error) {
      await cliente.query('ROLLBACK');
      await cliente.end();
      throw new Error(
        `El ajuste «${ajuste.nombre}» falló y se deshizo: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  await cliente.end();
  console.log(`Listo: ${AJUSTES.length} ajuste(s) al día.`);
}

main().catch((error: unknown) => {
  console.error('No se pudo actualizar la base de datos:');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
