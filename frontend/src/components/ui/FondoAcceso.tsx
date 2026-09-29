/**
 * Halos y retícula tenues de las pantallas de acceso: dan profundidad sin
 * competir con el formulario. Lo comparten el inicio de sesión y la
 * recuperación de la contraseña, que son dos caras de la misma puerta.
 */
export function FondoAcceso() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute left-1/2 top-0 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-marca-500/12 blur-[100px]" />
      <div className="absolute bottom-0 right-0 size-[28rem] translate-x-1/3 translate-y-1/3 rounded-full bg-info/8 blur-[100px]" />
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 70%)',
        }}
      />
    </div>
  );
}
