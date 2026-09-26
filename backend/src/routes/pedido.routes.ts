import { Router } from 'express';
import * as ctrl from '../controllers/pedido.controller.js';
import * as seguimiento from '../controllers/seguimiento.controller.js';
import { requiereAutenticacion, requierePermiso } from '../middlewares/auth.middleware.js';
import { validarCuerpo, validarIdParam } from '../middlewares/validate.middleware.js';
import { esquemaConfirmarPedido } from '../dtos/pedido.dto.js';

/** Portal de pedidos del cliente (CU-PED-02, CU-PED-03 y CU-PED-04). */
const router = Router();

router.use(requiereAutenticacion);

router.post(
  '/',
  requierePermiso('PEDIDO_GESTIONAR'),
  validarCuerpo(esquemaConfirmarPedido),
  ctrl.confirmar,
);
router.get('/', requierePermiso('PEDIDO_LEER'), ctrl.listar);
router.get('/:id', requierePermiso('PEDIDO_LEER'), validarIdParam, ctrl.detalle);
// Dónde viene el repartidor del pedido propio, mientras está en camino.
router.get('/:id/seguimiento', requierePermiso('PEDIDO_LEER'), validarIdParam, seguimiento.paraCliente);
router.post('/:id/cancelar', requierePermiso('PEDIDO_GESTIONAR'), validarIdParam, ctrl.cancelar);

export default router;
