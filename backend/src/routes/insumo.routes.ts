import { Router } from 'express';
import * as ctrl from '../controllers/insumo.controller.js';
import {
  requiereAlgunPermiso,
  requiereAutenticacion,
  requierePermiso,
} from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaActualizarInsumo, esquemaCrearInsumo } from '../dtos/insumo.dto.js';

/**
 * CU-INV-01 — Gestionar Insumo. Actor: Empleado.
 *
 * La lista también la lee quien produce: el formulario de la orden estima su
 * costo con el de cada insumo de la receta (CU-PRO-02).
 */
const router = Router();

router.use(requiereAutenticacion);

router.get('/unidades', requierePermiso('STOCK_CONSULTAR'), ctrl.listarUnidades);
router.get('/', requiereAlgunPermiso('STOCK_CONSULTAR', 'ORDEN_PRODUCCION_GESTIONAR'), ctrl.listar);
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
