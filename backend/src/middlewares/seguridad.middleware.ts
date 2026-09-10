import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Límite de intentos por dirección IP en el inicio de sesión (RNF-SEG-01).
 *
 * CU-SEG-05 bloquea la cuenta a los tres intentos fallidos, y esa defensa,
 * sola, es también la forma de atacar el sistema: quien conozca los nombres de
 * usuario del personal puede bloquear **todas** las cuentas en un minuto con
 * tres peticiones por cuenta, incluida la del administrador, que es el único
 * que puede desbloquear.
 *
 * El límite por IP corta eso de raíz: no importa contra cuántas cuentas
 * distintas se intente, el atacante solo puede probar unas pocas veces desde
 * su dirección.
 *
 * Cuenta **solo los intentos fallidos**: quien entra bien no gasta cupo, de
 * modo que un mostrador con varios empleados detrás de la misma IP no se
 * queda sin turnos por trabajar normalmente.
 */
export const limiteDeIntentos = rateLimit({
  windowMs: env.seguridad.ventanaIntentosMs,
  limit: env.seguridad.maxIntentosPorIp,
  skipSuccessfulRequests: true,
  // Borrador 6: publica `RateLimit-Limit` y `RateLimit-Remaining` por
  // separado. El 7 los combina en una sola cabecera, más difícil de leer para
  // un cliente y para quien diagnostica.
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      'Demasiados intentos fallidos desde esta conexión. Espere unos minutos antes de reintentar.',
  },
});
