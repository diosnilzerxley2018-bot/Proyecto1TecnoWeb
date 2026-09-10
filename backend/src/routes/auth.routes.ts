import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import { validarCuerpo } from '../middlewares/validate.middleware.js';
import { requiereAutenticacion } from '../middlewares/auth.middleware.js';
import { limiteDeIntentos } from '../middlewares/seguridad.middleware.js';

const router = Router();

/**
 * CU-SEG-01 Iniciar Sesión (extendido por CU-SEG-05).
 *
 * El límite por IP va **antes** de la validación: si ya se agotaron los
 * intentos, no hay por qué gastar trabajo en interpretar el cuerpo.
 */
router.post('/login', limiteDeIntentos, validarCuerpo(ctrl.esquemaLogin), ctrl.login);

/**
 * CU-VEN-02 Autorregistro de cliente: ruta pública, sin autenticación previa.
 * Lleva el mismo límite porque también es un extremo abierto que se puede
 * usar para crear cuentas en masa.
 */
router.post('/registro', limiteDeIntentos, validarCuerpo(ctrl.esquemaRegistro), ctrl.registro);
router.post('/logout', requiereAutenticacion, ctrl.logout);
router.get('/perfil', requiereAutenticacion, ctrl.perfil);

export default router;
