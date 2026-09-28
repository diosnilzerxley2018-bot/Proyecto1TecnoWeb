import { test, expect } from '@playwright/test';
import { ADMIN, iniciarSesion, registrarCliente } from './ayudantes';

/**
 * Requisito 1 del proyecto: los casos de uso, recorridos de punta a punta.
 *
 * Un cliente arma su carrito y pide a domicilio pagando en efectivo
 * (CU-PED-01), lo ve en «Mis pedidos», y el personal lo encuentra en su
 * lista (CU-PED-02). Es el camino que ninguna otra suite recorre entero: la
 * de la API no tiene carrito y la de componentes no tiene servidor.
 */

test('un cliente pide en efectivo y el personal recibe el pedido', async ({ page, request }) => {
  const cliente = await registrarCliente(request);
  await iniciarSesion(page, cliente.usuario, cliente.contrasena);
  await expect(page).toHaveURL(/\/portal/);

  // Al carrito, el primer producto con stock del catálogo.
  await page.getByRole('button', { name: 'Agregar', exact: true }).first().click();
  await page.getByRole('link', { name: 'Carrito con 1 artículo(s)' }).click();
  await expect(page.getByRole('heading', { name: 'Su pedido' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Entrega: la primera vez se escribe la dirección.
  await expect(page.getByRole('heading', { name: 'Entrega y pago' })).toBeVisible();
  await page.getByLabel('Calle o avenida').fill('Avenida Banzer');
  await page.getByLabel('Número').fill('1200');
  await page.getByLabel('Referencia').fill('Portón verde, frente al parque');
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();

  // Confirmado: aparece en «Mis pedidos» con su número.
  await expect(page).toHaveURL(/\/portal\/pedidos/);
  const aviso = page.getByText(/Pedido #(\d{5}) confirmado/);
  await expect(aviso).toBeVisible();
  const numero = (await aviso.textContent())!.match(/#(\d{5})/)![1];
  await expect(page.getByText(`#${numero}`).first()).toBeVisible();

  // El personal lo encuentra en su lista, esperando que lo preparen.
  await page.evaluate(() => localStorage.clear());
  await iniciarSesion(page, ADMIN.usuario, ADMIN.contrasena);
  await expect(page).toHaveURL(/\/inicio$/);
  await page.goto(`/pedidos/lista?pedido=${Number(numero)}`);
  await expect(page.getByText(`#${numero}`).first()).toBeVisible();
});
