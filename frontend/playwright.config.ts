import { defineConfig } from '@playwright/test';

/**
 * Pruebas de punta a punta (E2E): un navegador de verdad recorre la
 * aplicación como lo haría una persona, contra la interfaz y la API
 * funcionando.
 *
 * Completan las otras dos suites: vitest + supertest prueba la API contra
 * PostgreSQL (`backend/tests`) y vitest + Testing Library prueba componentes
 * sueltos (`frontend/tests`). Ninguna de las dos abre un navegador, así que
 * no ven lo que solo aparece con todo junto: la sesión, la navegación entre
 * pantallas, el carrito que llega al pedido.
 *
 * No levanta servidores: se corren contra una instalación que ya funciona.
 * Por omisión, la de desarrollo (`npm run dev` en `backend/` y aquí); con
 * `E2E_URL` y `E2E_API`, cualquier otra.
 */
export default defineConfig({
  testDir: './e2e',
  /*
   * En serie: todas las pruebas escriben en la misma base, y el límite de
   * intentos fallidos por dirección IP es compartido.
   */
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:3000',
    // El Chrome instalado en la máquina: no hace falta descargar navegadores.
    channel: 'chrome',
    viewport: { width: 1366, height: 900 },
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
