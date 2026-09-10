import { Router } from 'express';
import * as ctrl from '../controllers/venta.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import {
  esquemaAnularVenta,
  esquemaCrearVenta,
  esquemaEvaluarVenta,
  esquemaVentaConProduccion,
} from '../dtos/venta.dto.js';

/** CU-VEN-01 — Gestionar Venta. Actor: Empleado. */
const router = Router();

router.use(requiereAutenticacion);

router.get('/', requierePermiso('VENTA_LEER'), ctrl.listar);
router.post('/', requierePermiso('VENTA_REGISTRAR'), validarCuerpo(esquemaCrearVenta), ctrl.crear);

/**
 * Producción al instante. Exige además el permiso de producción: la operación
 * no solo vende, también elabora y mueve el inventario de insumos.
 *
 * Se declaran antes de `/:id` para que esas palabras no se tomen por un
 * identificador.
 */
router.post(
  '/evaluacion',
  requierePermiso('VENTA_REGISTRAR'),
  validarCuerpo(esquemaEvaluarVenta),
  ctrl.evaluar,
);
router.post(
  '/con-produccion',
  requierePermiso('VENTA_REGISTRAR'),
  requierePermiso('ORDEN_PRODUCCION_GESTIONAR'),
  validarCuerpo(esquemaVentaConProduccion),
  ctrl.crearConProduccion,
);

router.post(
  '/:id/anular',
  requierePermiso('VENTA_REGISTRAR'),
  validarIdParam,
  validarCuerpo(esquemaAnularVenta),
  ctrl.anular,
);

router.get('/:id', requierePermiso('VENTA_LEER'), validarIdParam, ctrl.obtener);
router.get('/:id/comprobante', requierePermiso('VENTA_LEER'), validarIdParam, ctrl.comprobante);

export default router;
