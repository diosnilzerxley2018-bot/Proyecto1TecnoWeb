import { Router } from 'express';
import * as ctrl from '../controllers/insumo.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaActualizarInsumo, esquemaCrearInsumo } from '../dtos/insumo.dto.js';

/** CU-INV-01 — Gestionar Insumo. Actor: Empleado. */
const router = Router();

router.use(requiereAutenticacion);

router.get('/unidades', requierePermiso('STOCK_CONSULTAR'), ctrl.listarUnidades);
router.get('/', requierePermiso('STOCK_CONSULTAR'), ctrl.listar);
router.get('/:id', requierePermiso('STOCK_CONSULTAR'), validarIdParam, ctrl.obtener);

router.post('/', requierePermiso('INSUMO_GESTIONAR'), validarCuerpo(esquemaCrearInsumo), ctrl.crear);
router.put(
  '/:id',
  requierePermiso('INSUMO_GESTIONAR'),
  validarIdParam,
  validarCuerpo(esquemaActualizarInsumo),
  ctrl.actualizar,
);
router.delete('/:id', requierePermiso('INSUMO_GESTIONAR'), validarIdParam, ctrl.eliminar);

export default router;
