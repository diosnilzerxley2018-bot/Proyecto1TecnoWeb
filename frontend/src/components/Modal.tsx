'use client';

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
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onClick={onCerrar}
    >
      <div
        className={`w-full ${ancho} rounded-xl bg-superficie shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borde px-5 py-4">
          <h2 className="font-semibold text-tinta">{titulo}</h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded px-2 text-xl leading-none text-tinta-tenue hover:bg-white/5 hover:text-tinta-suave"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
