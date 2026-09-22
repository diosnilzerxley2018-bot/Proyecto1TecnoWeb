import { Router } from 'express';
import * as ctrl from '../controllers/pago.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaCambiarModo } from '../dtos/pago.dto.js';

/**
 * RF-PED-04 — Cobros.
 *
 * El aviso de la pasarela se monta en su propio router **sin** autenticación:
 * lo llama un servidor ajeno que no tiene con qué iniciar sesión. Su defensa es
 * la firma criptográfica que verifica el servicio, no un token.
 */
export const avisos = Router();

/**
 * `GET` además de `POST`: Libélula devuelve al cliente a esta dirección con el
 * desenlace en los parámetros, que es una navegación del navegador y por tanto
 * un `GET`. Registrada solo como `POST`, el aviso moría en un 404 y el cobro
 * se quedaba pendiente para siempre.
 */
avisos.get('/notificacion', ctrl.recibirAviso);
avisos.post('/notificacion', ctrl.recibirAviso);

/* --- Consulta y gestión de cobros, para el personal --- */
export const pagos = Router();

pagos.use(requiereAutenticacion);

pagos.get('/', requierePermiso('VENTA_LEER'), ctrl.listar);
pagos.post('/vencer', requierePermiso('VENTA_REGISTRAR'), ctrl.vencerPendientes);

/**
 * La consulta de un cobro no exige permiso de personal: el cliente que está
 * pagando su propio pedido tiene que poder ver si ya se acreditó. Sí exige
 * sesión, y solo devuelve el estado del cobro, sin datos de nadie más.
 */
pagos.get('/:id', validarIdParam, ctrl.obtener);

pagos.post(
  '/:id/confirmar',
  requierePermiso('VENTA_REGISTRAR'),
  validarIdParam,
  ctrl.confirmarManual,
);
pagos.post('/:id/anular', requierePermiso('VENTA_REGISTRAR'), validarIdParam, ctrl.anular);

/* --- Modo de cobro: solo el administrador --- */
export const configuracion = Router();

configuracion.use(requiereAutenticacion, requierePermiso('CONFIGURACION_GESTIONAR'));

configuracion.get('/cobro', ctrl.estadoCobro);
configuracion.put('/cobro', validarCuerpo(esquemaCambiarModo), ctrl.cambiarModo);
