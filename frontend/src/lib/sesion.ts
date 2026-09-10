import type { Sesion } from '@/types';

const CLAVE = 'nutriexpress.sesion';

export function guardarSesion(sesion: Sesion) {
  try { localStorage.setItem(CLAVE, JSON.stringify(sesion)); } catch { /* ignorar */ }
}

export function leerSesion(): Sesion | null {
  try {
    const bruto = localStorage.getItem(CLAVE);
    return bruto ? (JSON.parse(bruto) as Sesion) : null;
  } catch { return null; }
}

export function borrarSesion() {
  try { localStorage.removeItem(CLAVE); } catch { /* ignorar */ }
}
