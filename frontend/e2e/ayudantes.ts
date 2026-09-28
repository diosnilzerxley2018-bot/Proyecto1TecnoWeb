import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** La API contra la que corre la interfaz probada. */
export const API = process.env.E2E_API ?? 'http://localhost:4000/api';

/** El administrador del seed (`backend/prisma/seed.ts`). */
export const ADMIN = {
  usuario: process.env.E2E_ADMIN_USUARIO ?? 'admin',
  contrasena: process.env.E2E_ADMIN_CLAVE ?? 'Admin1234!',
};

/** Un sufijo para que cada corrida cree datos que no choquen con los anteriores. */
export const sufijo = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * Un cliente nuevo, creado por la API (CU-VEN-02).
 *
 * Se crea directo contra la API y no llenando el formulario: el alta no es lo
 * que prueban quienes lo usan, y hacerlo por la interfaz alargaría cada
 * prueba sin agregar nada. El formulario tiene su propia prueba.
 */
export async function registrarCliente(request: APIRequestContext) {
  const usuario = `e2e${sufijo()}`;
  const contrasena = 'Cliente1234!';
  const alta = await request.post(`${API}/auth/registro`, {
    data: {
      nombre: 'Prueba',
      apellido: 'Navegador',
      email: `${usuario}@correo.bo`,
      nombreUsuario: usuario,
      contrasena,
    },
  });
  expect(alta.ok(), `alta del cliente: ${await alta.text()}`).toBeTruthy();
  return { usuario, contrasena };
}

/** Llena el formulario de inicio de sesión y lo envía. */
export async function iniciarSesion(page: Page, usuario: string, contrasena: string) {
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(usuario);
  await page.getByLabel('Contraseña').fill(contrasena);
  await page.getByRole('button', { name: 'Entrar' }).click();
}
