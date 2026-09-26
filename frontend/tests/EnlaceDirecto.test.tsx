import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useEnlaceDirecto } from '@/components/ui/usarEnlaceDirecto';

/**
 * Enlaces directos a una pantalla (`?buscar=`, `?pedido=`…).
 *
 * El caso que motivó el mecanismo: estando ya en una pantalla, elegir en un
 * buscador algo de esa misma pantalla cambia la dirección sin volver a montar
 * la página. Leer el parámetro una sola vez, al abrir, lo perdía.
 */

let parametros = new URLSearchParams();
const reemplazar = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => parametros,
  useRouter: () => ({ replace: reemplazar }),
  usePathname: () => '/portal',
}));

function Pantalla({ alRecibir }: { alRecibir: (v: { termino?: string }) => void }) {
  const inicial = useEnlaceDirecto(['termino'], alRecibir);
  return <p>inicial: {inicial.termino ?? '—'}</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  parametros = new URLSearchParams();
});

describe('useEnlaceDirecto', () => {
  it('aplica el parámetro al abrir y lo quita de la dirección', () => {
    parametros = new URLSearchParams('termino=limonada');
    const alRecibir = vi.fn();

    const { getByText } = render(<Pantalla alRecibir={alRecibir} />);

    // El valor está disponible al dibujar: la primera consulta ya sale filtrada.
    expect(getByText('inicial: limonada')).toBeInTheDocument();
    expect(alRecibir).toHaveBeenCalledWith({ termino: 'limonada' });
    expect(reemplazar).toHaveBeenCalledWith('/portal', { scroll: false });
  });

  it('atiende un enlace nuevo estando ya en la pantalla', () => {
    const alRecibir = vi.fn();
    const { rerender } = render(<Pantalla alRecibir={alRecibir} />);
    expect(alRecibir).not.toHaveBeenCalled();

    // El buscador empuja `?termino=avena` sin que la página se vuelva a montar.
    parametros = new URLSearchParams('termino=avena');
    rerender(<Pantalla alRecibir={alRecibir} />);

    expect(alRecibir).toHaveBeenCalledWith({ termino: 'avena' });
  });

  it('no toca los parámetros que no atiende', () => {
    parametros = new URLSearchParams('termino=avena&pagina=2');
    render(<Pantalla alRecibir={vi.fn()} />);

    expect(reemplazar).toHaveBeenCalledWith('/portal?pagina=2', { scroll: false });
  });
});
