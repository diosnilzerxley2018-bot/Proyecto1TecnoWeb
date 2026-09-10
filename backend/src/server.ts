import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';

const servidor = app.listen(env.port, () => {
  console.log(`API NutriExpress escuchando en http://localhost:${env.port}/api`);
});

async function apagar(senal: string) {
  console.log(`\n${senal} recibido, cerrando...`);
  servidor.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void apagar('SIGINT'));
process.on('SIGTERM', () => void apagar('SIGTERM'));
