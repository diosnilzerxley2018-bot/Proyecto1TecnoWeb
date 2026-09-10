'use client';

import { useEffect, useState } from 'react';
import { Campo, AreaTexto, Interruptor } from '@/components/ui/Campo';
import { Selector } from '@/components/ui/Selector';
import { Boton } from '@/components/ui/Boton';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import type { Categoria, Producto, TipoConservacion } from '@/types';

/**
 * Alta y edición de productos (CU-PRO-01).
 *
 * La información nutricional no se pide aquí a propósito: el caso de uso la
 * declara opcional y registrable más adelante, de modo que es una operación
 * aparte —CU-PRO-03, que extiende a este— y no un campo obligatorio del alta.
 */
export function FormularioProducto({
  producto,
  onListo,
  onCancelar,
}: {
  producto?: Producto;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const { notificar } = useNotificaciones();
  const editando = Boolean(producto);

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nombre, setNombre] = useState(producto?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '');
  const [precio, setPrecio] = useState(String(producto?.precio ?? ''));
  const [idCategoria, setIdCategoria] = useState<number | null>(producto?.categoria.id ?? null);
  const [tipo, setTipo] = useState<TipoConservacion>(producto?.tipoConservacion ?? 'Refrigerado');
  const [activo, setActivo] = useState(producto?.activo ?? true);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Categoria[]>('/catalogo/categorias')
      .then((lista) => {
        setCategorias(lista);
        setIdCategoria((actual) => actual ?? lista[0]?.id ?? null);
      })
      .catch(() => notificar('error', 'No se pudieron cargar las categorías'));
  }, [notificar]);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    if (idCategoria === null) {
      setError('Seleccione una categoría');
      return;
    }

    const cuerpo = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      precioVenta: Number(precio || 0),
      idCategoria,
      tipoConservacion: tipo,
      ...(editando ? { activo } : {}),
    };

    setEnviando(true);
    try {
      if (editando) {
        await api.put(`/productos/${producto!.id}`, cuerpo);
        notificar('exito', 'Producto actualizado');
      } else {
        await api.post('/productos', cuerpo);
        notificar('exito', 'Producto registrado');
      }
      onListo();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar el producto');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo
        etiqueta="Nombre del producto"
        required
        minLength={2}
        maxLength={100}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />

      <AreaTexto
        etiqueta="Descripción"
        maxLength={250}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Cómo se presenta el producto al cliente"
        ayuda="Se muestra en el catálogo público del portal"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Precio de venta"
          type="number"
          step="0.01"
          min="0"
          required
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          sufijo="Bs"
        />

        <Selector<number>
          etiqueta="Categoría"
          valor={idCategoria}
          onCambiar={setIdCategoria}
          opciones={categorias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
        />
      </div>

      <Selector<TipoConservacion>
        etiqueta="Conservación"
        valor={tipo}
        onCambiar={setTipo}
        ayuda="Decide en qué almacén puede guardarse el producto terminado"
        opciones={[
          { valor: 'Seco', etiqueta: 'Seco', descripcion: 'Ambiente, sin refrigeración' },
          {
            valor: 'Refrigerado',
            etiqueta: 'Refrigerado',
            descripcion: 'Cadena de frío para perecederos',
          },
        ]}
      />

      {editando && (
        <Interruptor
          activo={activo}
          onCambiar={setActivo}
          etiqueta="Producto activo"
          descripcion="Al darlo de baja desaparece del catálogo público, pero conserva sus ventas y pedidos"
        />
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Boton type="button" variante="fantasma" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" variante="primario" cargando={enviando}>
          {editando ? 'Guardar cambios' : 'Registrar producto'}
        </Boton>
      </div>
    </form>
  );
}
