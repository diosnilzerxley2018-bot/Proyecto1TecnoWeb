import type { Request, Response, NextFunction } from 'express';
import * as pagoService from '../services/pago.service.js';

/**
 * Barrido periódico de cobros vencidos.
 *
 * El problema que resuelve es concreto: un cliente abre la pantalla de pago,
 * se arrepiente y cierra la pestaña. El pedido queda `Pendiente de pago` con el
 * stock reservado, y como nadie vuelve a mirar ese cobro, nada lo vence. La
 * comida queda congelada en el inventario indefinidamente.
 *
 * Se resuelve aquí y no con un temporizador porque un `setInterval` muere con
 * el proceso y se duplica si el servidor corre en varias instancias. Colgado
 * del tránsito normal de la API, el barrido ocurre mientras haya alguien
 * usando el sistema, que es exactamente cuando hace falta.
 *
 * Dos cuidados para que no cueste nada:
 *
 * - **Se limita por tiempo**: como mucho una vez por intervalo, sin importar
 *   cuántas peticiones lleguen.
 * - **No se espera**: la petición sigue su curso sin bloquearse. Un fallo del
 *   barrido no puede romper la pantalla de nadie.
 *
 * En una instalación de verdad conviene además un proceso programado, para que
 * el stock también se libere de madrugada. Esto no lo reemplaza: lo cubre
 * mientras no exista.
 */

const INTERVALO_MS = 60_000;

let ultimoBarrido = 0;
let enCurso = false;

export function reiniciarBarrido(): void {
  ultimoBarrido = 0;
  enCurso = false;
}

export function barridoDeCobros(_req: Request, _res: Response, next: NextFunction): void {
  next();

  const ahora = Date.now();
  if (enCurso || ahora - ultimoBarrido < INTERVALO_MS) return;

  ultimoBarrido = ahora;
  enCurso = true;

  void pagoService
    .vencerPendientes()
    .catch((error: unknown) => {
      // Se registra y se sigue: el barrido es una red de seguridad, no una
      // operación de la que dependa la petición en curso.
      console.error('[cobros] falló el barrido de vencidos:', error);
    })
    .finally(() => {
      enCurso = false;
    });
}
