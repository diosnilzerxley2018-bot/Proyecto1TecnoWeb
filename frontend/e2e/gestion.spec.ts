import { test, expect } from '@playwright/test';
import { ADMIN, iniciarSesion } from './ayudantes';

/**
 * Requisito 7 del proyecto: reportes parametrizados, en PDF y por correo a
 * una o varias cuentas. Y el buscador general del personal.
 *
 * Con el correo en modo `simulado` —el de desarrollo— el envío no sale a
 * ninguna parte. Contra una instalación con correo real, `E2E_CORREOS` dice a
 * quién mandarlo.
 */
const CORREOS = process.env.E2E_CORREOS ?? 'reportes1@example.com, reportes2@example.com';

test.describe('Gestión', () => {
  test.beforeEach(async ({ page }) => {
    await iniciarSesion(page, ADMIN.usuario, ADMIN.contrasena);
    await expect(page).toHaveURL(/\/inicio$/);
  });

  test('el reporte de ventas se filtra por fechas, se ve en PDF y se envía a varias cuentas', async ({
    page,
  }) => {
    await page.goto('/ventas/reportes');
    await expect(page.getByRole('heading', { name: 'Reporte de ventas' })).toBeVisible();

    await page.getByLabel('Desde').fill('2026-01-01');
    await page.getByLabel('Hasta').fill('2026-12-31');

    const pdf = page.waitForResponse(
      (r) => r.url().includes('/reportes/ventas.pdf') && r.url().includes('desde=2026-01-01'),
    );
    await page.getByRole('button', { name: 'Ver en PDF' }).click();
    const respuesta = await pdf;
    expect(respuesta.status()).toBe(200);
    expect(respuesta.headers()['content-type']).toContain('application/pdf');

    await page.getByRole('button', { name: 'Enviar por correo' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Enviar el reporte' });
    await dialogo.getByLabel('Correo de los destinatarios').fill(CORREOS);
    await expect(dialogo.getByText(/llegará a 2 cuentas/)).toBeVisible();
    await dialogo.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(page.getByText('Reporte enviado a 2 cuentas')).toBeVisible();
  });

  test('el buscador general lleva a la pantalla elegida', async ({ page }) => {
    await page.keyboard.press('Control+K');
    const caja = page.getByRole('combobox', { name: 'Buscar en el sistema' });
    await expect(caja).toBeVisible();

    await caja.fill('movimientos');
    await page.getByRole('option', { name: /Movimientos/ }).first().click();
    await expect(page).toHaveURL(/\/inventario\/movimientos/);
  });
});
