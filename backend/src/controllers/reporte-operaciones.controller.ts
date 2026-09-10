import type { Request, Response } from 'express';
import type { z } from 'zod';
import * as reporteService from '../services/reporte-operaciones.service.js';
import * as entrega from '../services/reporte-entrega.service.js';
import {
  esquemaReporteInventario,
  esquemaReportePedidos,
  esquemaReporteProduccion,
} from '../dtos/reporte.dto.js';
import { idUsuarioDeSesion } from '../utils/sesion.js';
import { ErrorApp } from '../errors/error-app.js';

/**
 * RF-PED-10, RF-PRO-08 y RF-INV-08 — reportes de pedidos, producción e
 * inventario.
 *
 * Los tres se consultan igual: filtros por *query*, el mismo reporte en PDF y
 * el mismo PDF por correo. Lo único que cambia entre ellos es qué esquema
 * valida los filtros y qué servicio calcula; eso se declara en una tabla y los
 * tres verbos se escriben una vez.
 *
 * Sin la tabla serían nueve manejadores idénticos salvo por un nombre, y
 * corregir la cabecera del PDF obligaría a tocar los nueve.
 */

/**
 * Un reporte, ya sin sus tipos propios.
 *
 * El filtro y el resultado de cada uno son distintos, y al leerlos desde la
 * tabla TypeScript no puede saber que el filtro que valida y el reporte que se
 * entrega son los del mismo. Por eso `declarar` **cierra** ambas funciones
 * mientras los tipos aún están ligados, y hacia afuera expone una sola forma.
 */
interface ReporteDeclarado {
  /** Solo se le pide validar: pedir el `ZodType` completo ata la varianza. */
  esquema: { safeParse: (dato: unknown) => z.ZodSafeParseResult<unknown> };
  datos: (idUsuario: number, filtro: unknown) => Promise<unknown>;
  entrega: (idUsuario: number, filtro: unknown) => Promise<entrega.EntregaReporte>;
}

function declarar<F, R>(definicion: {
  esquema: { safeParse: (dato: unknown) => z.ZodSafeParseResult<F> };
  calcular: (idUsuario: number, filtro: F) => Promise<R>;
  entrega: (reporte: R) => entrega.EntregaReporte;
}): ReporteDeclarado {
  const calcular = (idUsuario: number, filtro: unknown) =>
    definicion.calcular(idUsuario, filtro as F);

  return {
    esquema: definicion.esquema,
    datos: calcular,
    entrega: async (idUsuario, filtro) =>
      definicion.entrega(await calcular(idUsuario, filtro)),
  };
}

const REPORTES = {
  pedidos: declarar({
    esquema: esquemaReportePedidos,
    calcular: reporteService.pedidos,
    entrega: reporteService.entregaDePedidos,
  }),
  produccion: declarar({
    esquema: esquemaReporteProduccion,
    calcular: reporteService.produccion,
    entrega: reporteService.entregaDeProduccion,
  }),
  inventario: declarar({
    esquema: esquemaReporteInventario,
    calcular: reporteService.inventario,
    entrega: reporteService.entregaDeInventario,
  }),
};

export type NombreReporte = keyof typeof REPORTES;

/**
 * Valida los filtros.
 *
 * Los de la consulta llegan por *query* y los del correo por cuerpo; el
 * esquema es el mismo, así que se le pasa el origen que corresponda.
 */
function filtros(nombre: NombreReporte, origen: unknown) {
  const validado = REPORTES[nombre].esquema.safeParse(origen);
  if (!validado.success) {
    throw new ErrorApp(400, validado.error.issues.map((i) => i.message).join('; '));
  }
  return validado.data;
}

/** Los datos en JSON, que es lo que dibuja la pantalla. */
export const consultar = (nombre: NombreReporte) => async (req: Request, res: Response) => {
  // El permiso lo verificó la ruta; el servicio comprueba, además, que quien
  // consulta sea empleado.
  res.json(await REPORTES[nombre].datos(idUsuarioDeSesion(req), filtros(nombre, req.query)));
};

/**
 * El mismo reporte en PDF.
 *
 * `inline` y no `attachment`: el navegador lo abre en una pestaña y desde ahí
 * se imprime o se guarda. Forzar la descarga obliga a abrir el archivo para
 * ver si era el que se quería.
 */
export const pdf = (nombre: NombreReporte) => async (req: Request, res: Response) => {
  const { pdf: documento, nombre: archivo } = await entrega.descargable(
    await REPORTES[nombre].entrega(idUsuarioDeSesion(req), filtros(nombre, req.query)),
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${archivo}"`);
  res.send(documento);
};

/** El PDF adjunto a un correo. */
export const enviar = (nombre: NombreReporte) => async (req: Request, res: Response) => {
  const { para, ...resto } = req.body as { para: string };

  res.json(
    await entrega.porCorreo(
      para,
      await REPORTES[nombre].entrega(idUsuarioDeSesion(req), filtros(nombre, resto)),
    ),
  );
};
