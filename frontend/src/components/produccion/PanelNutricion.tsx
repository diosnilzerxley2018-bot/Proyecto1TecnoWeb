'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Pencil, Sparkles } from 'lucide-react';
import { Campo } from '@/components/ui/Campo';
import { Boton } from '@/components/ui/Boton';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { api, ErrorApi } from '@/lib/api';
import { useNotificaciones } from '@/components/ui/Notificaciones';
import type { Producto, ValorNutricional } from '@/types';
import { formatearCantidad } from '@/lib/formato';

const MACROS = [
  { clave: 'proteinas', etiqueta: 'Proteínas', color: 'bg-info' },
  { clave: 'carbohidratos', etiqueta: 'Carbohidratos', color: 'bg-aviso' },
  { clave: 'grasas', etiqueta: 'Grasas', color: 'bg-violeta' },
] as const;

/**
 * CU-PRO-03 — Registrar Valor Nutricional.
 *
 * Extiende a CU-PRO-01 y es opcional: el producto existe con o sin ella, y
 * puede registrarse al alta o mucho después. Por eso la vista distingue con
 * claridad el caso "todavía no registrada" del caso "registrada en cero".
 */
export function PanelNutricion({
  producto,
  puedeGestionar,
  onGuardado,
}: {
  producto: Producto;
  puedeGestionar: boolean;
  onGuardado: () => void;
}) {
  const [editando, setEditando] = useState(false);

  if (!producto.valorNutricional && !editando) {
    return (
      <EstadoVacio
        icono={<Sparkles className="size-6" aria-hidden />}
        titulo="Sin información nutricional"
        descripcion="Es opcional y puede registrarse en cualquier momento. El portal la muestra junto al precio y la descripción."
        accion={
          puedeGestionar && (
            <Boton variante="primario" onClick={() => setEditando(true)}>
              Registrar valores
            </Boton>
          )
        }
      />
    );
  }

  if (editando) {
    return (
      <FormularioNutricion
        producto={producto}
        onCancelar={() => setEditando(false)}
        onListo={() => {
          setEditando(false);
          onGuardado();
        }}
      />
    );
  }

  return <ResumenNutricion
    valor={producto.valorNutricional!}
    puedeGestionar={puedeGestionar}
    onEditar={() => setEditando(true)}
  />;
}

function ResumenNutricion({
  valor,
  puedeGestionar,
  onEditar,
}: {
  valor: ValorNutricional;
  puedeGestionar: boolean;
  onEditar: () => void;
}) {
  const totalMacros = valor.proteinas + valor.carbohidratos + valor.grasas;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl border border-aviso/25 bg-aviso/10 text-aviso">
            <Flame className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-2xl font-semibold tabular-nums leading-none text-tinta">
              {valor.calorias}
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-wider text-tinta-tenue">
              kilocalorías
            </p>
          </div>
        </div>

        {puedeGestionar && (
          <Boton variante="secundario" tamano="sm" onClick={onEditar} icono={<Pencil className="size-3.5" aria-hidden />}>
            Editar
          </Boton>
        )}
      </div>

      {/* Reparto de macronutrientes: una barra apilada comunica la proporción
          mucho antes que tres cifras sueltas. */}
      {totalMacros > 0 && (
        <div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
            {MACROS.map((macro) => {
              const gramos = valor[macro.clave];
              return (
                <motion.div
                  key={macro.clave}
                  initial={{ width: 0 }}
                  animate={{ width: `${(gramos / totalMacros) * 100}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  className={macro.color}
                  title={`${macro.etiqueta}: ${formatearCantidad(gramos)} g`}
                />
              );
            })}
          </div>

          <ul className="mt-3 grid grid-cols-3 gap-2">
            {MACROS.map((macro) => (
              <li key={macro.clave} className="rounded-xl border border-borde bg-white/[0.02] px-3 py-2.5">
                <span className="flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${macro.color}`} aria-hidden />
                  <span className="text-[10px] uppercase tracking-wider text-tinta-tenue">
                    {macro.etiqueta}
                  </span>
                </span>
                <p className="mt-1.5 text-sm tabular-nums text-tinta">
                  {formatearCantidad(valor[macro.clave])} g
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-borde bg-white/[0.02] px-3.5 py-2.5">
        <span className="text-[10px] uppercase tracking-wider text-tinta-tenue">Fibra</span>
        <p className="mt-1 text-sm tabular-nums text-tinta">
          {valor.fibra === null ? 'No registrada' : `${formatearCantidad(valor.fibra)} g`}
        </p>
      </div>
    </div>
  );
}

function FormularioNutricion({
  producto,
  onListo,
  onCancelar,
}: {
  producto: Producto;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const { notificar } = useNotificaciones();
  const actual = producto.valorNutricional;

  const [calorias, setCalorias] = useState(String(actual?.calorias ?? ''));
  const [proteinas, setProteinas] = useState(String(actual?.proteinas ?? ''));
  const [carbohidratos, setCarbohidratos] = useState(String(actual?.carbohidratos ?? ''));
  const [grasas, setGrasas] = useState(String(actual?.grasas ?? ''));
  const [fibra, setFibra] = useState(actual?.fibra === null ? '' : String(actual?.fibra ?? ''));

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      await api.put(`/productos/${producto.id}/valor-nutricional`, {
        calorias: Number(calorias || 0),
        proteinas: Number(proteinas || 0),
        carbohidratos: Number(carbohidratos || 0),
        grasas: Number(grasas || 0),
        fibra: fibra.trim() === '' ? null : Number(fibra),
      });
      notificar('exito', 'Información nutricional guardada');
      onListo();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar la información');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo
        etiqueta="Calorías"
        type="number"
        step="1"
        min="0"
        required
        value={calorias}
        onChange={(e) => setCalorias(e.target.value)}
        sufijo="kcal"
        ayuda="Valor entero, por porción"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo
          etiqueta="Proteínas"
          type="number"
          step="0.01"
          min="0"
          required
          value={proteinas}
          onChange={(e) => setProteinas(e.target.value)}
          sufijo="g"
        />
        <Campo
          etiqueta="Carbohidratos"
          type="number"
          step="0.01"
          min="0"
          required
          value={carbohidratos}
          onChange={(e) => setCarbohidratos(e.target.value)}
          sufijo="g"
        />
        <Campo
          etiqueta="Grasas"
          type="number"
          step="0.01"
          min="0"
          required
          value={grasas}
          onChange={(e) => setGrasas(e.target.value)}
          sufijo="g"
        />
      </div>

      <Campo
        etiqueta="Fibra"
        type="number"
        step="0.01"
        min="0"
        value={fibra}
        onChange={(e) => setFibra(e.target.value)}
        sufijo="g"
        ayuda="Opcional. Déjelo vacío si no se declara"
      />

      {error && (
        <p role="alert" className="rounded-xl bg-peligro/10 px-3.5 py-2.5 text-sm text-peligro">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="fantasma" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" variante="primario" cargando={enviando}>
          Guardar
        </Boton>
      </div>
    </form>
  );
}
