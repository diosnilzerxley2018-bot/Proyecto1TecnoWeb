'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ProductoCatalogo } from '@/types';

export interface LineaCarrito {
  idProducto: number;
  nombre: string;
  precio: number;
  cantidad: number;
  stockDisponible: number;
}

interface ContextoCarrito {
  lineas: LineaCarrito[];
  cantidadTotal: number;
  importeTotal: number;
  agregar: (producto: ProductoCatalogo, cantidad?: number) => void;
  cambiarCantidad: (idProducto: number, cantidad: number) => void;
  quitar: (idProducto: number) => void;
  vaciar: () => void;
}

const Contexto = createContext<ContextoCarrito | null>(null);
const CLAVE = 'nutriexpress.carrito';

/**
 * Carrito del portal de pedidos.
 *
 * Vive solo en el navegador: el servidor no conoce carritos, únicamente
 * pedidos confirmados. Se conserva en `localStorage` para que recargar la
 * página no borre lo elegido, y **nunca** guarda el precio como fuente de
 * verdad: al confirmar solo viajan producto y cantidad, y el total lo calcula
 * el servidor con el precio vigente. El precio guardado aquí es únicamente
 * para mostrar un subtotal mientras el cliente decide.
 */
export function CarritoProvider({ children }: { children: React.ReactNode }) {
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE);
      if (guardado) setLineas(JSON.parse(guardado) as LineaCarrito[]);
    } catch {
      // Un carrito ilegible se descarta sin molestar al cliente.
    }
    setHidratado(true);
  }, []);

  useEffect(() => {
    if (!hidratado) return;
    try {
      localStorage.setItem(CLAVE, JSON.stringify(lineas));
    } catch {
      // Sin almacenamiento disponible el carrito sigue funcionando en memoria.
    }
  }, [lineas, hidratado]);

  const agregar = useCallback((producto: ProductoCatalogo, cantidad = 1) => {
    setLineas((actuales) => {
      const existente = actuales.find((l) => l.idProducto === producto.id);
      if (existente) {
        return actuales.map((l) =>
          l.idProducto === producto.id
            ? { ...l, cantidad: Math.min(l.cantidad + cantidad, producto.stockDisponible) }
            : l,
        );
      }
      return [
        ...actuales,
        {
          idProducto: producto.id,
          nombre: producto.nombre,
          precio: producto.precio,
          cantidad: Math.min(cantidad, producto.stockDisponible),
          stockDisponible: producto.stockDisponible,
        },
      ];
    });
  }, []);

  const cambiarCantidad = useCallback((idProducto: number, cantidad: number) => {
    setLineas((actuales) =>
      cantidad <= 0
        ? actuales.filter((l) => l.idProducto !== idProducto)
        : actuales.map((l) =>
            l.idProducto === idProducto
              ? { ...l, cantidad: Math.min(cantidad, l.stockDisponible) }
              : l,
          ),
    );
  }, []);

  const quitar = useCallback((idProducto: number) => {
    setLineas((actuales) => actuales.filter((l) => l.idProducto !== idProducto));
  }, []);

  const vaciar = useCallback(() => setLineas([]), []);

  const valor = useMemo<ContextoCarrito>(
    () => ({
      lineas,
      cantidadTotal: lineas.reduce((total, l) => total + l.cantidad, 0),
      importeTotal: lineas.reduce((total, l) => total + l.precio * l.cantidad, 0),
      agregar,
      cambiarCantidad,
      quitar,
      vaciar,
    }),
    [lineas, agregar, cambiarCantidad, quitar, vaciar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCarrito(): ContextoCarrito {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useCarrito debe usarse dentro de CarritoProvider');
  return contexto;
}
