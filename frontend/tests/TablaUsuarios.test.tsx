import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TablaUsuarios } from '@/components/TablaUsuarios';
import type { UsuarioLista } from '@/types';

/**
 * CU-SEG-02 — la tabla de usuarios ofrece en cada fila lo que se puede hacer
 * con esa cuenta, y nada que el servidor vaya a rechazar.
 */

const usuario = (datos: Partial<UsuarioLista> = {}): UsuarioLista => ({
  id: 10,
  nombreCompleto: 'María Gómez',
  nombreUsuario: 'mgomez',
  email: 'mgomez@correo.bo',
  rol: 'Empleado',
  activo: true,
  bloqueado: false,
  ...datos,
});

const TODO_PERMITIDO = { puedeEditar: true, puedeDarDeBaja: true, puedeAsignarPermisos: true };

function dibujar(usuarios: UsuarioLista[], extra: Partial<Parameters<typeof TablaUsuarios>[0]> = {}) {
  const manejadores = {
    onEditar: vi.fn(),
    onDesbloquear: vi.fn(),
    onPermisos: vi.fn(),
    onDarDeBaja: vi.fn(),
    onReactivar: vi.fn(),
  };
  render(
    <TablaUsuarios
      usuarios={usuarios}
      cargando={false}
      acciones={TODO_PERMITIDO}
      {...manejadores}
      {...extra}
    />,
  );
  return manejadores;
}

const fila = (nombreUsuario: string) =>
  within(screen.getByText(nombreUsuario).closest('tr')!);

describe('TablaUsuarios', () => {
  it('en la fila propia no ofrece la baja ni los permisos, que se los cambia otro', () => {
    dibujar([usuario({ id: 1, nombreUsuario: 'admin' }), usuario()], { idPropio: 1 });

    const propia = fila('admin');
    expect(propia.getByText('usted')).toBeInTheDocument();
    expect(propia.queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument();
    expect(propia.queryByRole('button', { name: 'Permisos' })).not.toBeInTheDocument();
    expect(propia.getByRole('button', { name: 'Editar' })).toBeInTheDocument();

    expect(fila('mgomez').getByRole('button', { name: 'Dar de baja' })).toBeInTheDocument();
  });

  it('una cuenta dada de baja se ofrece para reactivar, no para desbloquear', async () => {
    // Bloqueada y después dada de baja: lo que cuenta es la baja.
    const deBaja = usuario({ activo: false, bloqueado: true });
    const { onReactivar } = dibujar([deBaja]);

    const suFila = fila('mgomez');
    expect(suFila.getByText('De baja')).toBeInTheDocument();
    expect(suFila.queryByRole('button', { name: 'Desbloquear' })).not.toBeInTheDocument();

    await userEvent.click(suFila.getByRole('button', { name: 'Reactivar' }));
    expect(onReactivar).toHaveBeenCalledWith(deBaja);
  });

  it('sin el permiso de bajas no ofrece ni la baja ni la reactivación', () => {
    dibujar([usuario(), usuario({ id: 11, nombreUsuario: 'otro', activo: false })], {
      acciones: { ...TODO_PERMITIDO, puedeDarDeBaja: false },
    });

    expect(screen.queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reactivar' })).not.toBeInTheDocument();
  });

  it('resalta lo buscado en el nombre, aunque se haya escrito sin tilde', () => {
    dibujar([usuario()], { busqueda: 'maria' });
    expect(screen.getByText('María').tagName).toBe('MARK');
  });

  it('sin filas muestra el mensaje que corresponde a la búsqueda', () => {
    dibujar([], { vacio: 'Ningún usuario coincide' });
    expect(screen.getByText('Ningún usuario coincide')).toBeInTheDocument();
  });
});
