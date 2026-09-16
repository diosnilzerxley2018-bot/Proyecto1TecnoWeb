'use client';

/**
 * Ventana modal del escritorio del personal.
 *
 * El alto lo manda la ventana, no el contenido: un formulario más largo que la
 * pantalla —el de alta de usuario lo es— se desbordaba por arriba y por abajo
 * sin nada que desplazar, y el botón de guardar quedaba fuera de alcance.
 *
 * Por eso el desplazamiento se reparte en dos: el fondo desplaza el modal
 * entero cuando ni siquiera entra la cabecera, y el cuerpo desplaza solo los
 * campos, dejando fijos el título y el aspa de cerrar.
 */
export function Modal({
  titulo, children, onCerrar, ancho = 'max-w-lg',
}: {
  titulo: string;
  children: React.ReactNode;
  onCerrar: () => void;
  ancho?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto overscroll-contain bg-black/70 p-4"
      onClick={onCerrar}
    >
      <div
        className={`my-auto flex max-h-[calc(100dvh-2rem)] w-full ${ancho} flex-col rounded-xl bg-superficie shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-borde px-5 py-4">
          <h2 className="font-semibold text-tinta">{titulo}</h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded px-2 text-xl leading-none text-tinta-tenue hover:bg-white/5 hover:text-tinta-suave"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
