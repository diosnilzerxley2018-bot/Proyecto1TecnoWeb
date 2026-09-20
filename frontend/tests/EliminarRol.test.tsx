import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaginaRoles from '@/app/(privado)/roles/page';
import { motivoParaNoEliminar } from '@/lib/roles';
import { api } from '@/lib/api';
import type { Rol } from '@/types';

/**
 * CU-SEG-03 — eliminar un rol desde la pantalla de Roles y permisos.
 *
 * El botón no se esconde cuando no aplica: se deshabilita y dice por qué, para
 * que el administrador sepa que la acción existe y qué le falta para usarla.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), del: vi.fn() },
  // Misma firma que la real: el estado HTTP primero y el mensaje después.
  ErrorApi: class extends Error {
    constructor(
      public readonly estado: number,
      mensaje: string,
    ) {
      super(mensaje);
    }
  },
}));

vi.mock('@/components/RequierePermiso', () => ({
  RequierePermiso: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

let puedeGestionar = true;
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ tienePermiso: () => puedeGestionar }),
}));

const notificar = vi.fn();
vi.mock('@/components/ui/Notificaciones', () => ({
  useNotificaciones: () => ({ notificar }),
}));

const rol = (id: number, nombre: string, cantidadUsuarios: number, permisos = 0): Rol => ({
  id,
  nombre,
  cantidadUsuarios,
  permisos: Array.from({ length: permisos }, (_, i) => ({ id: i + 1, nombre: `PERMISO_${i}` })),
});

const ROLES = [
  rol(1, 'Administrador', 2, 20),
  rol(2, 'Cliente', 0, 2),
  rol(4, 'nada', 0, 0),
];

beforeEach(() => {
  vi.clearAllMocks();
  puedeGestionar = true;
  vi.mocked(api.get).mockImplementation((ruta: string) =>
    Promise.resolve((ruta === '/roles' ? ROLES : []) as never),
  );
});

/** La tarjeta de un rol, para no confundir sus botones con los de otra. */
async function tarjeta(nombre: string) {
  const titulo = await screen.findByRole('heading', { name: nombre });
  return within(titulo.closest('article')!);
}

describe('motivoParaNoEliminar', () => {
  it('un rol sin usuarios se puede eliminar', () => {
    expect(motivoParaNoEliminar({ nombre: 'nada', cantidadUsuarios: 0 })).toBeNull();
  });

  it('un rol con usuarios no, y dice cuántos', () => {
    expect(motivoParaNoEliminar({ nombre: 'Supervisor', cantidadUsuarios: 3 })).toContain('3 usuario(s)');
  });

  /** Aunque no tenga clientes: el autorregistro lo busca por su nombre. */
  it('el rol Cliente nunca, aunque esté vacío', () => {
    expect(motivoParaNoEliminar({ nombre: 'Cliente', cantidadUsuarios: 0 })).toContain('registro');
  });
});

describe('Pantalla de roles · eliminar', () => {
  it('elimina un rol vacío tras confirmar, y avisa', async () => {
    vi.mocked(api.del).mockResolvedValue(undefined as never);
    render(<PaginaRoles />);

    await userEvent.click((await tarjeta('nada')).getByRole('button', { name: /Eliminar el rol nada/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar rol' }));

    expect(api.del).toHaveBeenCalledWith('/roles/4');
    await waitFor(() => expect(notificar).toHaveBeenCalledWith('exito', 'Rol nada eliminado'));
  });

  it('no borra nada si se cancela la confirmación', async () => {
    render(<PaginaRoles />);

    await userEvent.click((await tarjeta('nada')).getByRole('button', { name: /Eliminar el rol nada/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(api.del).not.toHaveBeenCalled();
  });

  it('un rol con usuarios muestra el botón deshabilitado', async () => {
    render(<PaginaRoles />);
    const boton = (await tarjeta('Administrador')).getByRole('button', { name: /No se puede eliminar/ });
    expect(boton).toBeDisabled();
  });

  it('el rol Cliente muestra el botón deshabilitado aunque esté vacío', async () => {
    render(<PaginaRoles />);
    const boton = (await tarjeta('Cliente')).getByRole('button', { name: /No se puede eliminar/ });
    expect(boton).toBeDisabled();
  });

  it('si el servidor lo rechaza, avisa el motivo', async () => {
    const { ErrorApi } = await import('@/lib/api');
    vi.mocked(api.del).mockRejectedValue(
      new ErrorApi(409, 'El rol nada tiene 1 usuario(s) asignado(s).'),
    );
    render(<PaginaRoles />);

    await userEvent.click((await tarjeta('nada')).getByRole('button', { name: /Eliminar el rol nada/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar rol' }));

    await waitFor(() =>
      expect(notificar).toHaveBeenCalledWith('error', 'El rol nada tiene 1 usuario(s) asignado(s).'),
    );
  });

  it('sin permiso para gestionar roles no aparece la acción', async () => {
    puedeGestionar = false;
    render(<PaginaRoles />);

    await screen.findByRole('heading', { name: 'nada' });
    expect(screen.queryByRole('button', { name: /Eliminar/ })).toBeNull();
  });
});
