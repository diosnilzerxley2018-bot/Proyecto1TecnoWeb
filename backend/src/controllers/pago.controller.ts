import type { Request, Response } from 'express';
import * as pagoService from '../services/pago.service.js';
import * as configService from '../services/configuracion.service.js';
import { esquemaCambiarModo, esquemaFiltroPagos } from '../dtos/pago.dto.js';

/** Capa Controller — solo traduce HTTP; ninguna regla de negocio vive aquí. */

export async function listar(req: Request, res: Response) {
  const filtro = esquemaFiltroPagos.parse(req.query);
  res.json(await pagoService.listar(req.sesion!.idUsuario, filtro));
}

export async function obtener(req: Request, res: Response) {
  res.json(await pagoService.obtener(Number(req.params.id)));
}

export async function confirmarManual(req: Request, res: Response) {
  res.json(await pagoService.confirmarManual(req.sesion!.idUsuario, Number(req.params.id)));
}

export async function anular(req: Request, res: Response) {
  res.json(await pagoService.anular(req.sesion!.idUsuario, Number(req.params.id)));
}

export async function vencerPendientes(_req: Request, res: Response) {
  res.json({ vencidos: await pagoService.vencerPendientes() });
}

/**
 * Aviso de la pasarela (webhook).
 *
 * Es la única ruta pública que puede cambiar dinero de estado, así que se
 * apoya por completo en la verificación de firma que hace el servicio.
 *
 * Se responde 200 incluso cuando el aviso no corresponde a ningún cobro
 * conocido: una pasarela que recibe un error reintenta el aviso una y otra vez
 * durante horas, y no tiene sentido hacerla reintentar algo que nunca vamos a
 * poder procesar. Los errores de firma sí devuelven 401, porque ahí el
 * reintento no es el problema.
 */
export async function recibirAviso(req: Request, res: Response) {
  const cuerpoCrudo = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : JSON.stringify(req.body);

  /**
   * Libélula no envía cabeceras propias: el dato que autentica el aviso viaja
   * en la dirección misma, como `?testigo=...`. Se normaliza aquí para que la
   * pasarela reciba siempre un solo mapa y no tenga que conocer Express.
   */
  const testigo = typeof req.query.testigo === 'string' ? req.query.testigo : undefined;

  const resultado = await pagoService.procesarAviso(cuerpoCrudo, {
    ...(req.headers as Record<string, string | undefined>),
    ...(testigo ? { 'x-testigo-pago': testigo } : {}),
  });
  res.json(resultado);
}

/* --- Configuración del modo de cobro (solo administrador) --- */

export async function estadoCobro(_req: Request, res: Response) {
  res.json(await configService.estadoCobro());
}

export async function cambiarModo(req: Request, res: Response) {
  const { modo } = esquemaCambiarModo.parse(req.body);
  res.json(await configService.cambiarModoCobro(req.sesion!.idUsuario, modo));
}
