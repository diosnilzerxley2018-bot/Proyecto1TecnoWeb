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
/**
 * El inicio de sesión **no** lleva límite por dirección IP.
 *
 * Lo que se bloquea es la cuenta, no la conexión ni el equipo (CU-SEG-05). El
 * límite por IP contaba los intentos de todas las cuentas juntas, así que
 * probar tres contraseñas en tres cuentas distintas dejaba fuera al navegador
 * entero —y al de al lado, y al teléfono en la misma red—, incluso para quien
 * sabía su contraseña y no se había equivocado nunca. Peor: tapaba el aviso de
 * la cuenta bloqueada con uno sobre la conexión, que no le dice nada a quien
 * tiene que entender por qué no entra.
 *
 * La defensa es la escalada por cuenta: tres intentos, un minuto; tres más,
 * cinco minutos; tres más y solo el administrador reabre.
 */
router.post('/login', validarCuerpo(ctrl.esquemaLogin), ctrl.login);

/**
 * CU-VEN-02 Autorregistro de cliente: ruta pública, sin autenticación previa.
 * Lleva el mismo límite porque también es un extremo abierto que se puede
 * usar para crear cuentas en masa.
 */
router.post('/registro', limiteDeIntentos, validarCuerpo(ctrl.esquemaRegistro), ctrl.registro);
router.post('/logout', requiereAutenticacion, ctrl.logout);
router.get('/perfil', requiereAutenticacion, ctrl.perfil);

export default router;
