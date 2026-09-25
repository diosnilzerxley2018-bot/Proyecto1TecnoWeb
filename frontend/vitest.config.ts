import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/** Pruebas de componentes del frontend. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    /*
     * Las pruebas que escriben en un campo con `userEvent` tardan un segundo
     * solas, pero los archivos corren en paralelo, y en una máquina cargada
     * llegaban a los 5 s del límite por omisión y fallaban sin haber
     * encontrado ningún error. El backend usa 30 s por la misma razón.
     */
    testTimeout: 15_000,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.tsx', 'tests/**/*.test.ts'],
  },
});
