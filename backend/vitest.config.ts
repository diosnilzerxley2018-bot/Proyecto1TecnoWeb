import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Las pruebas comparten una única base de datos: se ejecutan en serie
    // para que el estado de una no interfiera con el de otra.
    fileParallelism: false,
    globals: false,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Reconstruye la base antes de la corrida: sin esto el estado se acumula
    // entre ejecuciones y la suite empieza a fallar por stock agotado.
    globalSetup: ['./tests/preparar-global.ts'],
    include: ['tests/**/*.test.ts'],
    // La primera prueba tras reconstruir la base paga el arranque del motor.
    testTimeout: 30000,
  },
});
