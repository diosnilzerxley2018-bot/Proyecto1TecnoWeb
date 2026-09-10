import { Router } from 'express';
import * as ctrl from '../controllers/perfil.controller.js';
import { requiereAutenticacion } from '../middlewares/auth.middleware.js';
import { validarCuerpo } from '../middlewares/validate.middleware.js';
import {
  esquemaActualizarPerfil,
  esquemaCambiarContrasena,
} from '../dtos/perfil.dto.js';
import { esquemaPreferencias } from '../dtos/cliente.dto.js';

/**
 * Cuenta propia — sirve a empleados y a clientes por igual.
 *
 * No lleva `requierePermiso`: administrar la cuenta propia no es un privilegio
 * que se conceda, es lo mínimo que puede hacer quien inició sesión. El alcance
 * lo limita la sesión, no un permiso.
 */
const router = Router();

router.use(requiereAutenticacion);

router.get('/', ctrl.obtener);
router.put('/', validarCuerpo(esquemaActualizarPerfil), ctrl.actualizar);
router.put('/contrasena', validarCuerpo(esquemaCambiarContrasena), ctrl.cambiarContrasena);

/** Solo tiene sentido para clientes; el servicio rechaza al resto. */
router.put('/preferencias', validarCuerpo(esquemaPreferencias), ctrl.actualizarPreferencias);

export default router;
