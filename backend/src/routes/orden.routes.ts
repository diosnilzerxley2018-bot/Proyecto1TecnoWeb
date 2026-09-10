import { Router } from 'express';
import * as ctrl from '../controllers/orden-produccion.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaCrearOrden, esquemaFinalizarOrden } from '../dtos/orden.dto.js';

/** CU-PRO-02 y CU-PRO-04. Actor: Empleado. */
const router = Router();

router.use(requiereAutenticacion, requierePermiso('ORDEN_PRODUCCION_GESTIONAR'));

router.get('/', ctrl.listar);
router.post('/', validarCuerpo(esquemaCrearOrden), ctrl.crear);

/** Antes de `/:id`: si no, «resumen» se leería como un identificador. */
router.get('/resumen', ctrl.resumen);

router.get('/:id', validarIdParam, ctrl.obtener);
router.post('/:id/iniciar', validarIdParam, ctrl.iniciar);
router.post(
  '/:id/finalizar',
  validarIdParam,
  validarCuerpo(esquemaFinalizarOrden),
  ctrl.finalizar,
);
router.post('/:id/cancelar', validarIdParam, ctrl.cancelar);

export default router;
