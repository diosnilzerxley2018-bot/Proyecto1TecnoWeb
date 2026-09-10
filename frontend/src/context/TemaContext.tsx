'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Tema = 'ninos' | 'jovenes' | 'adultos';
export type Modo = 'dia' | 'noche';
export type PreferenciaModo = Modo | 'auto';

interface ContextoTema {
  tema: Tema;
  preferencia: PreferenciaModo;
  /** Modo realmente aplicado; con `auto` lo decide la hora del cliente. */
  modo: Modo;
  cambiarTema: (tema: Tema) => void;
  cambiarPreferencia: (preferencia: PreferenciaModo) => void;
}

const Contexto = createContext<ContextoTema | null>(null);

const CLAVE_TEMA = 'nutriexpress.tema';
const CLAVE_MODO = 'nutriexpress.modo';

/** Franja diurna: de las 07:00 a las 18:59 del reloj del propio cliente. */
const HORA_AMANECER = 7;
const HORA_ANOCHECER = 19;

function modoSegunLaHora(): Modo {
  const hora = new Date().getHours();
  return hora >= HORA_AMANECER && hora < HORA_ANOCHECER ? 'dia' : 'noche';
}

/**
 * RF-WEB-02 — "El sitio debe ofrecer al menos tres temas visuales
 * seleccionables (niños, jóvenes, adultos) y aplicar automáticamente el modo
 * día o noche según el horario del cliente."
 *
 * Son dos ejes distintos y por eso se guardan por separado: el tema es siempre
 * una elección explícita, mientras que el modo admite además el valor `auto`,
 * que es el comportamiento que pide el requisito. Elegir día o noche a mano
 * desactiva la automática, porque una preferencia expresa debe ganarle a una
 * inferencia.
 *
 * Ambos valores se aplican como atributos en `<html>`, donde el CSS redefine
 * los tokens del sistema de diseño. Ningún componente conoce el tema activo.
 */
export function TemaProvider({ children }: { children: React.ReactNode }) {
  const [tema, setTema] = useState<Tema>('jovenes');
  const [preferencia, setPreferencia] = useState<PreferenciaModo>('auto');
  const [modo, setModo] = useState<Modo>('noche');

  // Restaura la elección guardada antes de la primera pintura útil.
  useEffect(() => {
    try {
      const temaGuardado = localStorage.getItem(CLAVE_TEMA) as Tema | null;
      const modoGuardado = localStorage.getItem(CLAVE_MODO) as PreferenciaModo | null;
      if (temaGuardado) setTema(temaGuardado);
      if (modoGuardado) setPreferencia(modoGuardado);
    } catch {
      // Sin almacenamiento se usan los valores por omisión.
    }
  }, []);

  /**
   * Con `auto`, el modo se recalcula cada minuto: una sesión abierta al
   * anochecer debe cambiar sola, que es lo que el requisito describe.
   */
  useEffect(() => {
    if (preferencia !== 'auto') {
      setModo(preferencia);
      return;
    }

    setModo(modoSegunLaHora());
    const reloj = setInterval(() => setModo(modoSegunLaHora()), 60_000);
    return () => clearInterval(reloj);
  }, [preferencia]);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    document.documentElement.dataset.modo = modo;
  }, [tema, modo]);

  const cambiarTema = useCallback((nuevo: Tema) => {
    setTema(nuevo);
    try {
      localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {
      // La elección seguirá activa en esta sesión aunque no se pueda guardar.
    }
  }, []);

  const cambiarPreferencia = useCallback((nueva: PreferenciaModo) => {
    setPreferencia(nueva);
    try {
      localStorage.setItem(CLAVE_MODO, nueva);
    } catch {
      // Idem.
    }
  }, []);

  const valor = useMemo(
    () => ({ tema, preferencia, modo, cambiarTema, cambiarPreferencia }),
    [tema, preferencia, modo, cambiarTema, cambiarPreferencia],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTema(): ContextoTema {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useTema debe usarse dentro de TemaProvider');
  return contexto;
}
