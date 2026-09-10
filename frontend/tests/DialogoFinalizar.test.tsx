import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogoFinalizar } from '@/components/produccion/DialogoFinalizar';
import type { Almacen, OrdenProduccion } from '@/types';

/**
 * Cierre de una orden de producción, con merma (hallazgo H10).
 *
 * Lo que se comprueba es que el caso corriente —salió lo planificado— no
 * estorbe, y que informar una pérdida sea corregir un número, no un segundo
 * trámite.
 */

const notificar = vi.fn();

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  ErrorApi: class ErrorApi extends Error {},
}));

vi.mock('@/components/ui/Notificaciones', () => ({
  useNotificaciones: () => ({ notificar }),
}));

const { api } = await import('@/lib/api');
const consultar = vi.mocked(api.get);
const enviar = vi.mocked(api.post);

const ALMACENES: Almacen[] = [
  {
    id: 1,
    nombre: 'Almacen Seco',
    tipoConservacion: 'Seco',
    ubicacionFisica: 'Planta baja',
    activo: true,
    preferido: true,
  } as Almacen,
];

const ORDEN = {
  id: 7,
  cantidad: 4,
  estado: 'En proceso',
  producto: { id: 3, nombre: 'Barra de avena', tipoConservacion: 'Seco' },
  insumosRequeridos: [
    { idIngrediente: 1, nombre: 'Avena', unidad: 'kg', cantidadRequerida: 0.24, costoUnitario: 14 },
  ],
  merma: null,
  cantidadObtenida: null,
} as unknown as OrdenProduccion;

beforeEach(() => {
  vi.clearAllMocks();
  consultar.mockResolvedValue(ALMACENES);
  enviar.mockResolvedValue({ ...ORDEN, cantidadObtenida: 4, merma: 0 });
});

const dibujar = (orden: OrdenProduccion | null = ORDEN) =>
  render(
    <DialogoFinalizar orden={orden} onCerrar={vi.fn()} onFinalizado={vi.fn()} />,
  );

const campoObtenidas = () => screen.getByLabelText(/Porciones obtenidas/);
const botonConfirmar = () => screen.getByRole('button', { name: /Confirmar/ });

describe('DialogoFinalizar', () => {
  /** El caso corriente no debe pedir nada: se confirma y ya. */
  it('viene rellenado con lo planificado', async () => {
    dibujar();
    await waitFor(() => expect(campoObtenidas()).toHaveValue(4));
  });

  it('finaliza sin merma sin tocar el campo', async () => {
    const usuario = userEvent.setup();
    dibujar();
    await waitFor(() => expect(campoObtenidas()).toHaveValue(4));

    await usuario.click(botonConfirmar());

    await waitFor(() => expect(enviar).toHaveBeenCalled());
    expect(enviar.mock.calls[0][1]).toMatchObject({ cantidadObtenida: 4 });
  });

  /** Informar una pérdida es corregir un número, no abrir otro trámite. */
  it('avisa cuánta merma se va a registrar', async () => {
    const usuario = userEvent.setup();
    dibujar();
    await waitFor(() => expect(campoObtenidas()).toHaveValue(4));

    await usuario.clear(campoObtenidas());
    await usuario.type(campoObtenidas(), '1');

    expect(await screen.findByText(/3 de merma/)).toBeInTheDocument();
    // Y explica la consecuencia: el costo se reparte entre las que salieron.
    expect(screen.getByText(/se repartirá entre la/)).toBeInTheDocument();
  });

  it('no llama merma a obtener de más', async () => {
    const usuario = userEvent.setup();
    dibujar();
    await waitFor(() => expect(campoObtenidas()).toHaveValue(4));

    await usuario.clear(campoObtenidas());
    await usuario.type(campoObtenidas(), '6');

    expect(screen.queryByText(/de merma/)).not.toBeInTheDocument();
  });

  /**
   * Con pérdida total no entra nada al almacén, así que preguntar a cuál
   * sobra: el campo desaparece y el aviso dice qué va a ocurrir.
   */
  it('con pérdida total no pide almacén y anuncia la pérdida', async () => {
    const usuario = userEvent.setup();
    dibujar();
    await waitFor(() => expect(campoObtenidas()).toHaveValue(4));

    await usuario.clear(campoObtenidas());
    await usuario.type(campoObtenidas(), '0');

    expect(screen.queryByLabelText('Almacén')).not.toBeInTheDocument();
    expect(screen.getByText(/pérdida total/)).toBeInTheDocument();
    expect(botonConfirmar()).toBeEnabled();
  });

  it('no deja confirmar con el campo vacío', async () => {
    const usuario = userEvent.setup();
    dibujar();
    await waitFor(() => expect(campoObtenidas()).toHaveValue(4));

    await usuario.clear(campoObtenidas());

    expect(botonConfirmar()).toBeDisabled();
  });

  it('avisa la merma al terminar', async () => {
    const usuario = userEvent.setup();
    enviar.mockResolvedValue({ ...ORDEN, cantidadObtenida: 1, merma: 3 });
    dibujar();
    await waitFor(() => expect(campoObtenidas()).toHaveValue(4));

    await usuario.clear(campoObtenidas());
    await usuario.type(campoObtenidas(), '1');
    await usuario.click(botonConfirmar());

    await waitFor(() =>
      expect(notificar).toHaveBeenCalledWith('exito', 'Orden finalizada con 3 de merma'),
    );
  });
});
