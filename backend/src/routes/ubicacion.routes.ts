import { Router } from 'express';
import * as ctrl from '../controllers/ubicacion.controller.js';
import { requiereAutenticacion } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaCrearUbicacion } from '../dtos/ubicacion.dto.js';

/**
 * CU-PED-03 — direcciones del cliente.
 *
 * Como `/api/perfil`, no lleva `requierePermiso`: administrar las direcciones
 * propias no es un privilegio que se conceda. El alcance lo limita la sesión, y
 * el servicio exige que el usuario sea cliente.
 */
const router = Router();

router.use(requiereAutenticacion);

router.get('/', ctrl.listar);
router.post('/', validarCuerpo(esquemaCrearUbicacion), ctrl.crear);
router.put('/:id', validarIdParam, validarCuerpo(esquemaCrearUbicacion), ctrl.reemplazar);
router.delete('/:id', validarIdParam, ctrl.eliminar);

export default router;
