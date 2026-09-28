import { test, expect } from '@playwright/test';
import { ADMIN, iniciarSesion, registrarCliente, sufijo } from './ayudantes';

/**
 * Requisitos 5 y 6 del proyecto: roles con permisos, contraseñas con
 * complejidad, longitud y bloqueo. Aquí se ven desde el navegador; la API los
 * prueba por su cuenta en `backend/tests/auth.test.ts` y `seguridad.test.ts`.
 *
 * El bloqueo gasta tres intentos fallidos por corrida, y la API tolera diez
 * por dirección IP cada quince minutos: la suite se puede correr tres veces
 * seguidas.
 */

test.describe('Seguridad', () => {
  test('el administrador inicia sesión y llega a su escritorio', async ({ page }) => {
    await iniciarSesion(page, ADMIN.usuario, ADMIN.contrasena);

    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByRole('link', { name: /Usuarios/ }).first()).toBeVisible();
  });

  test('tres contraseñas incorrectas bloquean la cuenta', async ({ page, request }) => {
    const cliente = await registrarCliente(request);
    // El aviso del formulario: Next.js tiene además su anunciador de rutas,
    // que también es un `alert`, vacío.
    const aviso = page.locator('p[role="alert"]');

    await iniciarSesion(page, cliente.usuario, 'Incorrecta1!');
    await expect(aviso).toContainText('Le quedan 2 intento(s)');

    await page.getByLabel('Contraseña').fill('Incorrecta2!');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(aviso).toContainText('Le quedan 1 intento(s)');

    await page.getByLabel('Contraseña').fill('Incorrecta3!');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(aviso).toContainText('Cuenta bloqueada');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('el registro rechaza una contraseña que no cumple la política', async ({ page }) => {
    const usuario = `e2e${sufijo()}`;
    await page.goto('/registro');
    await page.getByLabel('Nombre', { exact: true }).fill('Prueba');
    await page.getByLabel('Apellido').fill('Navegador');
    await page.getByLabel('Correo electrónico').fill(`${usuario}@correo.bo`);
    await page.getByLabel('Nombre de usuario').fill(usuario);
    // Ocho caracteres, pero sin mayúscula, número ni carácter especial.
    await page.getByLabel('Contraseña', { exact: true }).fill('solominus');
    await page.getByLabel('Repita la contraseña').fill('solominus');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.locator('p[role="alert"]')).toContainText('debe incluir una mayúscula');
    await expect(page).toHaveURL(/\/registro$/);
  });

  test('un cliente no puede entrar al escritorio del personal', async ({ page, request }) => {
    const cliente = await registrarCliente(request);
    await iniciarSesion(page, cliente.usuario, cliente.contrasena);
    await expect(page).toHaveURL(/\/portal/);

    // Escribir la dirección a mano tampoco sirve: el escritorio lo devuelve.
    await page.goto('/usuarios');
    await expect(page).toHaveURL(/\/portal/);
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toHaveCount(0);
  });
});
