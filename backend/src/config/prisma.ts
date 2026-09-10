import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env.js';

// Prisma 7 requiere un adaptador de controlador para la conexión directa.
const adaptador = new PrismaPg({ connectionString: env.databaseUrl });

// Instancia única del cliente Prisma para toda la aplicación.
// Solo la capa Model debe importarla.
export const prisma = new PrismaClient({
  adapter: adaptador,
  log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
});
