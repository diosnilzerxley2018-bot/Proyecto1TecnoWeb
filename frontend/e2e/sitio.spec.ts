import { test, expect } from '@playwright/test';
import { iniciarSesion, registrarCliente } from './ayudantes';

/**
 * Requisitos 2, 3 y 4 del proyecto, tal como los ve quien visita el sitio:
 * los temas y el modo día/noche, el contador de visitas en el pie y la
 * búsqueda en el encabezado de la página principal.
 */

test.describe('Sitio', () => {
  test('hay tres temas y modo día/noche, y el elegido se aplica a toda la página', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Cambiar apariencia del sitio' }).click();
    const panel = page.getByRole('dialog', { name: 'Apariencia del sitio' });

    for (const tema of ['Niños', 'Jóvenes', 'Adultos']) {
      await expect(panel.getByRole('button', { name: tema })).toBeVisible();
    }

    await panel.getByRole('button', { name: 'Niños' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'ninos');

    await panel.getByRole('button', { name: 'Noche' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-modo', 'noche');
    await panel.getByRole('button', { name: 'Día' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-modo', 'dia');
  });

  test('el pie de cada página muestra el número de visitas', async ({ page, request }) => {
    const contador = page.getByText(/\d+ visitas? acumuladas?/);

    await page.goto('/login');
    await expect(contador).toBeVisible();
    await page.goto('/registro');
    await expect(contador).toBeVisible();

    const cliente = await registrarCliente(request);
    await iniciarSesion(page, cliente.usuario, cliente.contrasena);
    await expect(page).toHaveURL(/\/portal/);
    await expect(contador).toBeVisible();
  });

  test('la búsqueda del encabezado encuentra productos del negocio', async ({ page, request }) => {
    const cliente = await registrarCliente(request);
    await iniciarSesion(page, cliente.usuario, cliente.contrasena);
    await expect(page).toHaveURL(/\/portal/);

    // Sin tilde y en minúsculas: la búsqueda no distingue ninguna de las dos.
    await page.getByLabel('Buscar productos e información').fill('ensalada');
    const resultado = page.getByRole('button', { name: /Ensalada/i }).first();
    await expect(resultado).toBeVisible();

    await page.getByLabel('Buscar productos e información').fill('xyzsinresultados');
    await expect(page.getByText('Nada coincide con «xyzsinresultados».')).toBeVisible();
  });
});
