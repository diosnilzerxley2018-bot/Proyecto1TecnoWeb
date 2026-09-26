import { Router } from 'express';
import * as ctrl from '../controllers/almacen.controller.js';
import {
  requiereAlgunPermiso,
  requiereAutenticacion,
  requierePermiso,
} from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaActualizarAlmacen, esquemaCrearAlmacen } from '../dtos/almacen.dto.js';

/**
 * CU-INV-02 — Gestionar Almacén.
 *
 * El actor del caso de uso es el Administrador, y así queda reflejado en los
 * permisos: `ALMACEN_GESTIONAR` no forma parte del rol Empleado. La lectura sí
 * se abre a `STOCK_CONSULTAR`, porque el personal necesita elegir almacén al
 * registrar movimientos, y la lista también a `ORDEN_PRODUCCION_GESTIONAR`:
 * al finalizar una orden se elige dónde guardar lo producido (CU-PRO-02).
 */
const router = Router();

router.use(requiereAutenticacion);

router.get('/', requiereAlgunPermiso('STOCK_CONSULTAR', 'ORDEN_PRODUCCION_GESTIONAR'), ctrl.listar);
router.get('/:id', requierePermiso('STOCK_CONSULTAR'), validarIdParam, ctrl.obtener);

router.post(
  '/',
  requierePermiso('ALMACEN_GESTIONAR'),
  validarCuerpo(esquemaCrearAlmacen),
  ctrl.crear,
);
router.put(
  '/:id',
  requierePermiso('ALMACEN_GESTIONAR'),
  validarIdParam,
  validarCuerpo(esquemaActualizarAlmacen),
  ctrl.actualizar,
);
router.delete('/:id', requierePermiso('ALMACEN_GESTIONAR'), validarIdParam, ctrl.eliminar);

export default router;
