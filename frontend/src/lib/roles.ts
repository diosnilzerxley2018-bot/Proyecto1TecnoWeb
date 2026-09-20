import type { Rol } from '@/types';
import { ROL_CLIENTE } from '@/lib/dominio';

/**
 * CU-SEG-03 — por qué un rol no se puede eliminar, o `null` si se puede.
 *
 * Es comodidad de interfaz: deshabilita el botón y explica el motivo **antes**
 * de que el administrador lo intente, en lugar de dejarlo pulsar y mostrarle
 * un error. La regla que manda es la del servidor (`rol.service.eliminar`);
 * esta la repite para que la pantalla no ofrezca lo que la API va a rechazar.
 */
export function motivoParaNoEliminar(rol: Pick<Rol, 'nombre' | 'cantidadUsuarios'>): string | null {
  if (rol.nombre === ROL_CLIENTE) {
    return 'El sistema usa este rol para el registro de clientes';
  }
  if (rol.cantidadUsuarios > 0) {
    return `Tiene ${rol.cantidadUsuarios} usuario(s): asígneles otro rol antes de eliminarlo`;
  }
  return null;
}
