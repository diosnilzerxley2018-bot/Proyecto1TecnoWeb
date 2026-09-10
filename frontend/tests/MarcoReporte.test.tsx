import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarcoReporte } from '@/components/reportes/MarcoReporte';
import { TablaReporte } from '@/components/reportes/PiezasReporte';

/**
 * El armazón común a los cuatro reportes (RF-VEN-07, RF-PED-10, RF-PRO-08 y
 * RF-INV-08).
 *
 * Lo que se comprueba aquí vale para los cuatro: que consulte con el rango y
 * los filtros, que un reporte vacío lo diga en vez de mostrar tablas en cero,
 * y que un fallo del correo no se anuncie como éxito.
 */

const notificar = vi.fn();

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), descargar: vi.fn() },
  ErrorApi: class ErrorApi extends Error {
    constructor(
      public estado: number,
      mensaje: string,
    ) {
      super(mensaje);
    }
  },
}));

vi.mock('@/components/ui/Notificaciones', () => ({
  useNotificaciones: () => ({ notificar }),
}));

const { api } = await import('@/lib/api');
const consultar = vi.mocked(api.get);
const enviar = vi.mocked(api.post);

interface ReportePrueba {
  resumen: { total: number };
  lineas: { nombre: string; importe: number }[];
}

const VACIO: ReportePrueba = { resumen: { total: 0 }, lineas: [] };
const CON_DATOS: ReportePrueba = {
  resumen: { total: 120 },
  lineas: [{ nombre: 'Jugo de guayaba', importe: 120 }],
};

function dibujar(filtros?: Record<string, string | number | undefined>) {
  return render(
    <MarcoReporte<ReportePrueba>
      titulo="Reporte de prueba"
      descripcion="Para verificar el armazón"
      recurso="prueba"
      filtros={filtros}
      vacio={(r) => r.lineas.length === 0}
      tituloVacio="Sin datos en el período"
    >
      {(reporte) => (
        <TablaReporte
          titulo="Detalle"
          filas={reporte.lineas}
          clave={(l) => l.nombre}
          columnas={[
            { titulo: 'Concepto', celda: (l) => l.nombre },
            { titulo: 'Importe', numerica: true, celda: (l) => l.importe },
          ]}
        />
      )}
    </MarcoReporte>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  consultar.mockResolvedValue(CON_DATOS);
});

describe('MarcoReporte', () => {
  it('consulta con el rango del mes en curso al abrirse', async () => {
    dibujar();

    await waitFor(() => expect(consultar).toHaveBeenCalled());

    const ruta = consultar.mock.calls[0][0] as string;
    expect(ruta).toContain('/reportes/prueba?');
    expect(ruta).toMatch(/desde=\d{4}-\d{2}-\d{2}/);
    expect(ruta).toMatch(/hasta=\d{4}-\d{2}-\d{2}/);
  });

  /** El filtro tiene que viajar; si se queda en la pantalla, el PDF miente. */
  it('agrega los filtros propios del reporte a la consulta', async () => {
    dibujar({ idProducto: 7 });

    await waitFor(() => expect(consultar).toHaveBeenCalled());
    expect(consultar.mock.calls[0][0]).toContain('idProducto=7');
  });

  it('omite los filtros sin valor en vez de mandarlos vacíos', async () => {
    dibujar({ idProducto: undefined, estado: '' });

    await waitFor(() => expect(consultar).toHaveBeenCalled());
    const ruta = consultar.mock.calls[0][0] as string;
    expect(ruta).not.toContain('idProducto');
    expect(ruta).not.toContain('estado');
  });

  it('vuelve a consultar cuando cambia el rango', async () => {
    const usuario = userEvent.setup();
    dibujar();
    await waitFor(() => expect(consultar).toHaveBeenCalledTimes(1));

    await usuario.clear(screen.getByLabelText('Desde'));
    await usuario.type(screen.getByLabelText('Desde'), '2026-01-15');

    await waitFor(() => {
      expect(consultar.mock.calls.at(-1)?.[0]).toContain('desde=2026-01-15');
    });
  });

  it('muestra el detalle cuando hay datos', async () => {
    dibujar();
    expect(await screen.findByText('Jugo de guayaba')).toBeInTheDocument();
  });

  /** Una tabla en cero se lee como un error; el vacío hay que nombrarlo. */
  it('avisa cuando el período no tiene nada, en vez de dibujar tablas vacías', async () => {
    consultar.mockResolvedValue(VACIO);
    dibujar();

    expect(await screen.findByText('Sin datos en el período')).toBeInTheDocument();
    expect(screen.queryByText('Detalle')).not.toBeInTheDocument();
  });

  it('muestra el error del servidor sin romper la pantalla', async () => {
    const { ErrorApi } = await import('@/lib/api');
    consultar.mockRejectedValue(new ErrorApi(400, 'El rango no puede superar 366 días'));
    dibujar();

    expect(await screen.findByRole('alert')).toHaveTextContent('366 días');
  });

  describe('Envío por correo', () => {
    it('manda el rango, los filtros y el destinatario', async () => {
      const usuario = userEvent.setup();
      enviar.mockResolvedValue({ enviado: true });
      dibujar({ idProducto: 7 });

      await screen.findByText('Jugo de guayaba');
      await usuario.click(screen.getByRole('button', { name: /Enviar por correo/ }));
      await usuario.type(screen.getByLabelText(/destinatario/), 'duenio@nutriexpress.bo');
      await usuario.click(screen.getByRole('button', { name: /^Enviar$/ }));

      await waitFor(() => expect(enviar).toHaveBeenCalled());
      expect(enviar.mock.calls[0][1]).toMatchObject({
        idProducto: 7,
        para: 'duenio@nutriexpress.bo',
      });
    });

    /**
     * Que el servidor de correo esté caído no invalida el reporte, pero
     * tampoco puede anunciarse como enviado: quien lo pidió estaría esperando
     * un mensaje que nunca sale.
     */
    it('no anuncia como enviado lo que el servidor rechazó', async () => {
      const usuario = userEvent.setup();
      enviar.mockResolvedValue({ enviado: false, motivo: 'El buzón no existe' });
      dibujar();

      await screen.findByText('Jugo de guayaba');
      await usuario.click(screen.getByRole('button', { name: /Enviar por correo/ }));
      await usuario.type(screen.getByLabelText(/destinatario/), 'nadie@ninguna.parte');
      await usuario.click(screen.getByRole('button', { name: /^Enviar$/ }));

      await waitFor(() => expect(notificar).toHaveBeenCalledWith('error', 'El buzón no existe'));
    });

    it('no deja enviar sin una dirección de correo', async () => {
      const usuario = userEvent.setup();
      dibujar();

      await screen.findByText('Jugo de guayaba');
      await usuario.click(screen.getByRole('button', { name: /Enviar por correo/ }));

      expect(screen.getByRole('button', { name: /^Enviar$/ })).toBeDisabled();
    });
  });
});

describe('TablaReporte', () => {
  it('dice que no hay datos en vez de dejar el cuerpo en blanco', () => {
    render(
      <TablaReporte
        titulo="Detalle"
        filas={[]}
        clave={(_, i) => i}
        columnas={[{ titulo: 'Concepto', celda: () => null }]}
      />,
    );

    expect(screen.getByText(/Sin datos en el período/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
