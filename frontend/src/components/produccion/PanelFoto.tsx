'use client';

import { useRef, useState } from 'react';
import { ImageOff, Trash2, Upload } from 'lucide-react';
import { Boton } from '@/components/ui/Boton';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import { urlImagenProducto } from '@/lib/imagenes';
import { TAMANO_MAXIMO_IMAGEN_PRODUCTO, TIPOS_IMAGEN_PRODUCTO } from '@/lib/dominio';
import type { Producto } from '@/types';

/**
 * Foto del producto.
 *
 * Extensión opcional, igual que el valor nutricional y la receta: el
 * producto existe con o sin ella, y se agrega después desde su ficha — por
 * eso no está en el formulario de alta, que crea el producto antes de que
 * exista un identificador al cual subir algo.
 *
 * Sube y quita de una vez, sin un botón "Guardar" aparte: no hay nada más que
 * juntar en la misma operación, a diferencia del resto de la ficha.
 */
export function PanelFoto({
  producto,
  puedeGestionar,
  onGuardado,
}: {
  producto: Producto;
  puedeGestionar: boolean;
  onGuardado: () => void;
}) {
  const { notificar } = useNotificaciones();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  // Vista previa local mientras la subida está en curso, para no esperar a
  // que vuelva el vaivén completo (subir → recargar el producto → recién ahí
  // mostrar algo).
  const [previa, setPrevia] = useState<string | null>(null);

  const tieneFoto = producto.imagenActualizadaEn !== null;
  const url = previa ?? urlImagenProducto(producto.id, producto.imagenActualizadaEn);

  async function elegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;

    if (!TIPOS_IMAGEN_PRODUCTO.includes(archivo.type)) {
      notificar('error', 'La imagen debe ser JPEG, PNG o WEBP');
      return;
    }
    if (archivo.size > TAMANO_MAXIMO_IMAGEN_PRODUCTO) {
      const limiteMb = TAMANO_MAXIMO_IMAGEN_PRODUCTO / (1024 * 1024);
      notificar('error', `La imagen supera el máximo de ${limiteMb} MB`);
      return;
    }

    const vistaPrevia = URL.createObjectURL(archivo);
    setPrevia(vistaPrevia);
    setSubiendo(true);
    try {
      const datos = new FormData();
      datos.append('imagen', archivo);
      await api.subir(`/productos/${producto.id}/imagen`, datos);
      notificar('exito', 'Foto guardada');
      onGuardado();
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo subir la imagen');
    } finally {
      setSubiendo(false);
      URL.revokeObjectURL(vistaPrevia);
      setPrevia(null);
    }
  }

  async function quitar() {
    setEliminando(true);
    try {
      await api.del(`/productos/${producto.id}/imagen`);
      notificar('exito', 'Foto eliminada');
      onGuardado();
    } catch (e) {
      notificar('error', e instanceof ErrorApi ? e.message : 'No se pudo quitar la imagen');
    } finally {
      setEliminando(false);
    }
  }

  return (
    <div className="space-y-5">
      {url ? (
        <div className="overflow-hidden rounded-2xl border border-borde bg-white/[0.02]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={producto.nombre}
            className="aspect-video w-full object-cover"
          />
        </div>
      ) : (
        <EstadoVacio
          icono={<ImageOff className="size-6" aria-hidden />}
          titulo="Sin foto"
          descripcion="Es opcional y puede agregarse en cualquier momento. El portal la muestra en el catálogo público."
        />
      )}

      {puedeGestionar && (
        <div className="flex justify-end gap-2">
          {tieneFoto && (
            <Boton
              variante="peligro"
              tamano="sm"
              onClick={quitar}
              cargando={eliminando}
              icono={<Trash2 className="size-3.5" aria-hidden />}
            >
              Quitar
            </Boton>
          )}
          <Boton
            variante="primario"
            tamano="sm"
            onClick={() => inputRef.current?.click()}
            cargando={subiendo}
            icono={<Upload className="size-3.5" aria-hidden />}
          >
            {tieneFoto ? 'Reemplazar' : 'Subir foto'}
          </Boton>
          <input
            ref={inputRef}
            type="file"
            accept={TIPOS_IMAGEN_PRODUCTO.join(',')}
            className="hidden"
            onChange={elegirArchivo}
          />
        </div>
      )}
    </div>
  );
}
