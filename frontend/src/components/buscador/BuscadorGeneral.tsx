'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, CornerDownLeft, Home, Loader2, Search, UserCog } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { destinosAccesibles, type Destino } from '@/lib/modulos';
import {
  ORDEN_TIPOS,
  TIPOS_RESULTADO,
  esNumero,
  estadoVisible,
  valeLaPenaBuscar,
} from '@/lib/busqueda';
import { coincide } from '@/lib/texto';
import { formatearBs } from '@/lib/formato';
import { cn } from '@/lib/cn';
import { Insignia } from '@/components/ui/Insignia';
import { TextoResaltado } from '@/components/ui/TextoResaltado';
import { useDesplazamientoBloqueado, useEscape } from '@/components/ui/Dialogo';
import { useRetardo } from '@/components/ui/usarRetardo';
import type { BusquedaGeneral, ResultadoGeneral } from '@/types';

/**
 * Buscador general del escritorio del personal.
 *
 * Una sola caja para llegar a cualquier cosa: una pantalla por su nombre
 * («punto de venta»), un pedido por su número («#12»), un cliente, un insumo o
 * un almacén por cómo se llama. Se abre desde la barra lateral o con Ctrl+K
 * (⌘K en Mac) desde cualquier pantalla.
 *
 * Las pantallas se filtran aquí mismo, sobre el catálogo de módulos; lo demás
 * lo busca el servidor, que solo devuelve lo que los permisos de quien busca
 * dejan ver.
 */

const Contexto = createContext<{ abrir: () => void } | null>(null);

/** Pantallas que no son módulos pero a las que también se llega buscando. */
const DESTINOS_FIJOS: Destino[] = [
  { ruta: '/inicio', etiqueta: 'Inicio', modulo: null, icono: Home, texto: 'Inicio principal' },
  {
    ruta: '/perfil',
    etiqueta: 'Mi perfil',
    modulo: null,
    icono: UserCog,
    texto: 'Mi perfil cuenta contraseña datos personales',
  },
];

export function ProveedorBuscador({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const abrir = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => setAbierto(false), []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAbierto((v) => !v);
      }
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, []);

  const valor = useMemo(() => ({ abrir }), [abrir]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <Paleta abierto={abierto} onCerrar={cerrar} />
    </Contexto.Provider>
  );
}

const esMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** El botón que abre el buscador: ancho en la barra lateral, solo el icono en el celular. */
export function BotonBuscar({ compacto = false }: { compacto?: boolean }) {
  const contexto = useContext(Contexto);
  if (!contexto) return null;

  if (compacto) {
    return (
      <button
        onClick={contexto.abrir}
        aria-label="Buscar"
        className="grid size-10 place-items-center rounded-xl text-tinta transition-colors hover:bg-white/5"
      >
        <Search className="size-5" aria-hidden />
      </button>
    );
  }

  return (
    <button
      onClick={contexto.abrir}
      className="flex h-10 w-full items-center gap-2.5 rounded-xl border border-borde bg-superficie-alta px-3 text-sm text-tinta-tenue transition-colors hover:border-borde-fuerte hover:text-tinta-suave"
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate text-left">Buscar…</span>
      <kbd className="rounded-md border border-borde px-1.5 py-0.5 font-sans text-[10px] text-tinta-tenue">
        {esMac() ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}

/** Una opción de la lista: una pantalla o un resultado del servidor. */
type Opcion =
  | { clase: 'destino'; clave: string; ruta: string; destino: Destino }
  | { clase: 'resultado'; clave: string; ruta: string; resultado: ResultadoGeneral };

function Paleta({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  useDesplazamientoBloqueado(abierto);
  useEscape(abierto, onCerrar);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {abierto && (
        <div className="fixed inset-0 z-100 flex items-start justify-center p-4 pt-[8vh] sm:pt-[12vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onCerrar}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Buscador general"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative flex max-h-[76vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl vidrio shadow-[0_40px_100px_-30px_rgba(0,0,0,1)]"
          >
            <Contenido onCerrar={onCerrar} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * El cuerpo del buscador. Vive aparte de la capa para que cada apertura
 * empiece de cero: sin el texto ni los resultados de la vez anterior.
 */
function Contenido({ onCerrar }: { onCerrar: () => void }) {
  const { sesion, tienePermiso } = useAuth();
  const router = useRouter();
  const id = useId();
  const idLista = `${id}-lista`;
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  const [texto, setTexto] = useState('');
  const termino = useRetardo(texto.trim(), 250);
  const [resultados, setResultados] = useState<ResultadoGeneral[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [resaltada, setResaltada] = useState(0);

  useEffect(() => campo.current?.focus(), []);

  const destinos = useMemo(
    () => [...DESTINOS_FIJOS, ...destinosAccesibles(tienePermiso, sesion?.usuario.cargo)],
    [tienePermiso, sesion?.usuario.cargo],
  );

  /**
   * Número de la última consulta. Si «cam» tarda más que «camila», su
   * respuesta llega después y no debe pisar a la buena.
   */
  const ultima = useRef(0);

  useEffect(() => {
    const consulta = ++ultima.current;
    if (!valeLaPenaBuscar(termino)) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    api
      .get<BusquedaGeneral>(`/buscar?q=${encodeURIComponent(termino)}`)
      .then((r) => {
        if (consulta === ultima.current) setResultados(r.resultados);
      })
      .catch(() => {
        if (consulta === ultima.current) setResultados([]);
      })
      .finally(() => {
        if (consulta === ultima.current) setBuscando(false);
      });
  }, [termino]);

  /** Pantallas primero: son lo más rápido de encontrar y no esperan al servidor. */
  const opciones = useMemo<Opcion[]>(() => {
    const vacio = texto.trim() === '';
    const pantallas = (
      vacio ? destinos : destinos.filter((d) => coincide(d.texto, texto)).slice(0, 5)
    ).map<Opcion>((destino) => ({
      clase: 'destino',
      clave: `destino-${destino.ruta}`,
      ruta: destino.ruta,
      destino,
    }));

    const encontrados = [...resultados]
      .sort((a, b) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo))
      .map<Opcion>((resultado) => ({
        clase: 'resultado',
        clave: `${resultado.tipo}-${resultado.id}`,
        ruta: TIPOS_RESULTADO[resultado.tipo].ruta(resultado),
        resultado,
      }));

    return [...pantallas, ...encontrados];
  }, [texto, destinos, resultados]);

  // Lo que cambia la lista devuelve el resaltado a la primera opción.
  useEffect(() => setResaltada(0), [opciones]);

  useEffect(() => {
    lista.current
      ?.querySelector(`[data-indice="${resaltada}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [resaltada]);

  function ir(opcion: Opcion) {
    onCerrar();
    router.push(opcion.ruta);
  }

  function alTeclear(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setResaltada((i) => Math.min(i + 1, opciones.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setResaltada((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opcion = opciones[resaltada];
      if (opcion) ir(opcion);
    } else if (e.key === 'Tab') {
      // El foco se queda en la caja: la lista se recorre con las flechas.
      e.preventDefault();
    }
  }

  const grupos = agrupar(opciones);
  const esperandoAlServidor = texto.trim() !== termino || buscando;
  const sinNada = texto.trim() !== '' && opciones.length === 0 && !esperandoAlServidor;

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-borde px-4">
        <Search className="size-5 shrink-0 text-tinta-tenue" aria-hidden />
        <input
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={alTeclear}
          role="combobox"
          aria-expanded="true"
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={opciones[resaltada] ? `${id}-${resaltada}` : undefined}
          aria-label="Buscar en el sistema"
          placeholder="Busque una pantalla, un pedido (#12), un cliente, un insumo…"
          autoComplete="off"
          spellCheck={false}
          // Sin el anillo de foco global: la caja es el foco natural de la capa y
          // ya se sabe dónde se escribe. Va con `!` porque ese anillo está fuera
          // de las capas de Tailwind y le gana a cualquier utilidad normal.
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-tinta outline-none! placeholder:text-tinta-tenue"
        />
        {esperandoAlServidor && valeLaPenaBuscar(texto) && (
          <Loader2 className="size-4 shrink-0 animate-spin text-tinta-tenue" aria-label="Buscando" />
        )}
        <kbd className="hidden rounded-md border border-borde px-1.5 py-0.5 text-[10px] text-tinta-tenue sm:block">
          Esc
        </kbd>
      </div>

      <ul
        ref={lista}
        id={idLista}
        role="listbox"
        aria-label="Resultados"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
      >
        {grupos.map((grupo, g) => (
          <li key={grupo.titulo} role="presentation" className="mb-1 last:mb-0">
            <p
              id={`${id}-grupo-${g}`}
              role="presentation"
              className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-tinta-tenue"
            >
              {grupo.titulo}
            </p>
            <ul role="group" aria-labelledby={`${id}-grupo-${g}`}>
              {grupo.opciones.map(({ opcion, indice }) => (
                <FilaOpcion
                  key={opcion.clave}
                  id={`${id}-${indice}`}
                  indice={indice}
                  opcion={opcion}
                  texto={texto}
                  resaltada={indice === resaltada}
                  onResaltar={() => setResaltada(indice)}
                  onElegir={() => ir(opcion)}
                />
              ))}
            </ul>
          </li>
        ))}

        {sinNada && (
          <li role="presentation" className="px-4 py-10 text-center">
            <p className="text-sm text-tinta-suave">Nada coincide con «{texto.trim()}»</p>
            <p className="mt-1.5 text-xs text-tinta-tenue">
              {esNumero(texto)
                ? 'No hay pedidos, ventas ni órdenes con ese número que usted pueda ver.'
                : 'Pruebe con otra palabra, o con el número de un pedido, una venta o una orden.'}
            </p>
          </li>
        )}
      </ul>

      <div className="hidden shrink-0 items-center gap-4 border-t border-borde px-4 py-2.5 text-[11px] text-tinta-tenue sm:flex">
        <span>
          <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> para moverse
        </span>
        <span className="flex items-center gap-1">
          <CornerDownLeft className="size-3" aria-hidden /> para abrir
        </span>
        <span className="ml-auto">Solo aparece lo que sus permisos le dejan ver</span>
      </div>
    </>
  );
}

/** Reparte las opciones en grupos con título, sin perder su posición en la lista. */
function agrupar(opciones: Opcion[]) {
  const grupos: { titulo: string; opciones: { opcion: Opcion; indice: number }[] }[] = [];
  opciones.forEach((opcion, indice) => {
    const titulo =
      opcion.clase === 'destino' ? 'Pantallas' : TIPOS_RESULTADO[opcion.resultado.tipo].grupo;
    const grupo = grupos.at(-1);
    if (grupo?.titulo === titulo) grupo.opciones.push({ opcion, indice });
    else grupos.push({ titulo, opciones: [{ opcion, indice }] });
  });
  return grupos;
}

function FilaOpcion({
  id,
  indice,
  opcion,
  texto,
  resaltada,
  onResaltar,
  onElegir,
}: {
  id: string;
  indice: number;
  opcion: Opcion;
  texto: string;
  resaltada: boolean;
  onResaltar: () => void;
  onElegir: () => void;
}) {
  const Icono =
    opcion.clase === 'destino'
      ? opcion.destino.icono
      : TIPOS_RESULTADO[opcion.resultado.tipo].icono;
  const titulo = opcion.clase === 'destino' ? opcion.destino.etiqueta : opcion.resultado.titulo;
  const detalle =
    opcion.clase === 'destino' ? opcion.destino.modulo : opcion.resultado.detalle;
  const estado = opcion.clase === 'resultado' ? estadoVisible(opcion.resultado) : null;
  const monto = opcion.clase === 'resultado' ? opcion.resultado.monto : null;

  return (
    <li
      id={id}
      role="option"
      aria-selected={resaltada}
      data-indice={indice}
      onMouseMove={onResaltar}
      onClick={onElegir}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
        resaltada ? 'bg-marca-500/10' : 'hover:bg-white/[0.03]',
      )}
    >
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-lg border',
          resaltada
            ? 'border-marca-500/30 bg-marca-500/15 text-marca-300'
            : 'border-borde bg-superficie-alta text-tinta-suave',
        )}
      >
        <Icono className="size-4" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-tinta">
          <TextoResaltado texto={titulo} busqueda={texto} />
        </span>
        {detalle && (
          <span className="mt-0.5 block truncate text-xs text-tinta-tenue">
            <TextoResaltado texto={detalle} busqueda={texto} />
          </span>
        )}
      </span>

      {estado && (
        <Insignia tono={estado.tono} className="hidden sm:inline-flex">
          {estado.etiqueta}
        </Insignia>
      )}
      {monto !== null && (
        <span className="shrink-0 text-xs tabular-nums text-tinta-suave">{formatearBs(monto)}</span>
      )}
      <ArrowRight
        className={cn('size-4 shrink-0 text-marca-300', !resaltada && 'invisible')}
        aria-hidden
      />
    </li>
  );
}
