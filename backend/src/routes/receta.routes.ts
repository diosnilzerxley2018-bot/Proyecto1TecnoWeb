import { Router } from 'express';
import * as ctrl from '../controllers/receta.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaActualizarReceta } from '../dtos/receta.dto.js';

/** CU-PRO-01 — operaciones sobre una versión de receta concreta. */
const router = Router();

router.use(requiereAutenticacion, requierePermiso('PRODUCTO_GESTIONAR'));

// `validarIdParam` se aplica por ruta: en `router.use` los parámetros del
// patrón todavía no están resueltos y `req.params.id` llegaría vacío.

router.get('/:id', validarIdParam, ctrl.obtener);
router.put('/:id', validarIdParam, validarCuerpo(esquemaActualizarReceta), ctrl.actualizar);
router.delete('/:id', validarIdParam, ctrl.eliminar);

/** Reemplaza a la versión vigente, desactivándola en la misma transacción. */
router.post('/:id/activar', validarIdParam, ctrl.activar);

export default router;
